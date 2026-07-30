import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";

import pg from "pg";

const MIN_NODE_MAJOR = 22;
const MIN_NODE_MINOR = 22;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const toolRoot = resolve(root, "tools/promptfoo");
const datasetId = process.argv[2];

assertNodeVersion();
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for local evaluation");

const temporaryDir = await mkdtemp(join(tmpdir(), "llm-wiki-promptfoo-"));
let target;
try {
  const cases = await loadGoldCases(datasetId);
  if (!cases.length) throw new Error("No gold evaluation cases are available");
  target = await startTarget();
  const configPath = join(temporaryDir, "promptfoo.json");
  const resultPath = join(temporaryDir, "results.json");
  await writeFile(configPath, JSON.stringify(buildConfig(cases), null, 2));
  const promptfooExitCode = await runPromptfoo(configPath, resultPath, target.url);
  const result = JSON.parse(await readFile(resultPath, "utf8"));
  const summary = summarize(result);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (promptfooExitCode !== 0) process.exitCode = summary.status === "failed" ? 1 : promptfooExitCode;
} finally {
  target?.stop();
  await rm(temporaryDir, { recursive: true, force: true });
}

function assertNodeVersion() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < MIN_NODE_MAJOR || (major === MIN_NODE_MAJOR && minor < MIN_NODE_MINOR)) {
    throw new Error(`Promptfoo evaluation requires Node >=${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.0; found ${process.versions.node}`);
  }
}

async function loadGoldCases(selectedDatasetId) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      `select c.id, c.redacted_input, c.expected_outcome
       from ai_evaluation_cases c
       join ai_evaluation_datasets d on d.id = c.dataset_id
       where c.lifecycle = 'gold'
       and ($1::uuid is null or c.dataset_id = $1::uuid)
       order by d.approved_at asc, c.created_at asc
       limit 100`,
      [selectedDatasetId ?? null],
    );
    return result.rows.map((row) => ({
      id: row.id,
      question: row.redacted_input,
      expectedOutcome: row.expected_outcome || "Answer the request accurately using the selected local evidence.",
    }));
  } finally {
    await client.end();
  }
}

function buildConfig(cases) {
  return {
    description: "LLM Wiki local Ask/RAG regression suite",
    sharing: false,
    prompts: ["{{question}}"],
    providers: [`file://${resolve(toolRoot, "src/ask-rag-provider.mjs")}`],
    defaultTest: {
      options: {
        provider: {
          text: {
            id: `ollama:chat:${process.env.OLLAMA_LLM_MODEL ?? "llama3"}`,
            config: { temperature: 0 },
          },
        },
      },
      assert: [
        { type: "javascript", value: "output.trim().length > 0", metric: "nonempty_answer" },
        { type: "llm-rubric", value: "{{expectedOutcome}}", metric: "local_rubric" },
      ],
    },
    tests: cases.map((item) => ({
      description: `gold:${item.id}`,
      vars: { question: item.question, expectedOutcome: item.expectedOutcome },
    })),
  };
}

async function runPromptfoo(configPath, resultPath, targetUrl) {
  const executable = process.platform === "win32"
    ? join(toolRoot, "node_modules/.bin/promptfoo.cmd")
    : join(toolRoot, "node_modules/.bin/promptfoo");
  const environment = {
    ...process.env,
    LLM_WIKI_EVALUATION_TARGET_URL: targetUrl,
    PROMPTFOO_DISABLE_TELEMETRY: "1",
    PROMPTFOO_DISABLE_UPDATE: "1",
    PROMPTFOO_DISABLE_REMOTE_GENERATION: "true",
    PROMPTFOO_DISABLE_SHARING: "1",
    PROMPTFOO_CACHE_ENABLED: "false",
    PROMPTFOO_DISABLE_ERROR_LOG: "1",
    PROMPTFOO_DISABLE_DEBUG_LOG: "1",
    PROMPTFOO_STRIP_PROMPT_TEXT: "true",
    PROMPTFOO_STRIP_RESPONSE_OUTPUT: "true",
    PROMPTFOO_STRIP_TEST_VARS: "true",
    PROMPTFOO_STRIP_GRADING_RESULT: "true",
    PROMPTFOO_STRIP_METADATA: "true",
  };
  await new Promise((resolvePromise, reject) => {
    const child = spawn(executable, ["eval", "-c", configPath, "-o", resultPath, "--no-cache", "--no-share", "--no-write", "--no-table", "--no-progress-bar", "-j", "1"], {
      cwd: toolRoot,
      env: environment,
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || code === 100) resolvePromise(code);
      else reject(new Error(`Promptfoo exited with status ${code}`));
    });
  });
}

async function startTarget() {
  const port = await findOpenPort();
  const child = spawn("bun", ["scripts/evaluation/ask-rag-target.ts"], {
    cwd: root,
    env: { ...process.env, LLM_WIKI_EVALUATION_TARGET_PORT: String(port) },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out while starting the local Ask/RAG evaluation target")), 10_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.stdout.on("data", (data) => {
      if (data.toString().includes(`LLM_WIKI_EVALUATION_TARGET_READY:${port}`)) {
        clearTimeout(timeout);
        resolvePromise();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Local Ask/RAG evaluation target exited with status ${code}`));
    });
  });
  return { url: `http://127.0.0.1:${port}`, stop: () => child.kill("SIGTERM") };
}

function findOpenPort() {
  return new Promise((resolvePromise, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => error ? reject(error) : port ? resolvePromise(port) : reject(new Error("Could not allocate a local evaluation port")));
    });
  });
}

function summarize(result) {
  const stats = result?.results?.stats ?? result?.stats ?? {};
  return {
    engine: "promptfoo",
    status: Number(stats.failures ?? 0) > 0 ? "failed" : "succeeded",
    totalCases: Number(stats.successes ?? 0) + Number(stats.failures ?? 0),
    passed: Number(stats.successes ?? 0),
    failed: Number(stats.failures ?? 0),
  };
}
