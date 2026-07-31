import { evaluate } from "promptfoo";

process.env.PROMPTFOO_DISABLE_TELEMETRY = "true";

const input = await readJsonFromStandardInput();
const originalLog = console.log;
console.log = () => undefined;

try {
  const summary = await evaluatePromptfooMetrics(input);
  console.log = originalLog;
  process.stdout.write(`__LLM_WIKI_PROMPTFOO_RESULT__${JSON.stringify(summary)}\n`);
} catch (error) {
  console.log = originalLog;
  process.stderr.write(`promptfoo_metrics_failed:${error instanceof Error ? error.message : "unknown"}\n`);
  process.exitCode = 1;
}

async function evaluatePromptfooMetrics(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.cases) || !input.model) {
    throw new Error("invalid_promptfoo_metric_input");
  }

  const grader = createOllamaTextGrader(input.baseUrl, input.model, input.timeoutMs);
  const embedding = {
    id: `ollama:embeddings:${input.embeddingModel ?? "nomic-embed-text"}`,
  };
  const evaluation = await evaluate({
    prompts: ["{{query}}"],
    providers: [async (_prompt, context) => ({ output: String(context?.vars?.answer ?? "") })],
    tests: input.cases.map((item) => ({
      vars: {
        caseId: item.id,
        query: item.query,
        answer: item.answer,
        context: item.context,
      },
      options: { provider: { text: grader, embedding } },
      assert: buildAssertions(item.expectedOutcome),
    })),
    sharing: false,
    writeLatestResults: false,
  }, {
    cache: false,
    maxConcurrency: 1,
  });
  const summary = await evaluation.toEvaluateSummary();
  return {
    engine: "promptfoo",
    totalTokens: summary.stats.tokenUsage.assertions?.total ?? 0,
    cases: summary.results.map((result) => ({
      id: String(result.vars.caseId),
      metrics: Object.fromEntries((result.gradingResult.componentResults ?? []).map((component) => [
        component.assertion.type,
        { score: component.score, passed: component.pass, error: component.error ?? component.reason ?? null },
      ])),
    })),
  };
}

function buildAssertions(expectedOutcome) {
  const assertions = [
    { type: "context-faithfulness", threshold: 0 },
    { type: "context-relevance", threshold: 0 },
    { type: "answer-relevance", threshold: 0 },
  ];
  if (typeof expectedOutcome === "string" && expectedOutcome.trim()) {
    assertions.push(
      { type: "context-recall", value: expectedOutcome, threshold: 0 },
      { type: "factuality", value: expectedOutcome, threshold: 0 },
    );
  }
  return assertions;
}

async function readJsonFromStandardInput() {
  let payload = "";
  for await (const chunk of process.stdin) payload += chunk;
  return JSON.parse(payload);
}

function createOllamaTextGrader(baseUrl, model, configuredTimeoutMs) {
  const endpoint = `${String(baseUrl ?? "http://localhost:11434").replace(/\/$/, "")}/api/generate`;
  const timeoutMs = boundedTimeout(configuredTimeoutMs ?? process.env.EVALUATOR_TIMEOUT_MS);
  return {
    id: () => `llm-wiki-ollama:${model}`,
    async callApi(prompt) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          think: false,
          options: { temperature: 0, num_predict: 256 },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return { error: `ollama_http_${response.status}` };
      const body = await response.json();
      if (typeof body.response !== "string" || !body.response.trim()) return { error: "ollama_empty_response" };
      return {
        output: body.response,
        tokenUsage: {
          total: Number(body.prompt_eval_count ?? 0) + Number(body.eval_count ?? 0),
          prompt: Number(body.prompt_eval_count ?? 0),
          completion: Number(body.eval_count ?? 0),
        },
      };
    },
  };
}

function boundedTimeout(value) {
  const timeoutMs = Number(value);
  return Number.isInteger(timeoutMs) && timeoutMs >= 1_000 && timeoutMs <= 120_000 ? timeoutMs : 30_000;
}
