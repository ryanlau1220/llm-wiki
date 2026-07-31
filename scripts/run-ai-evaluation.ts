import { getAiEvaluationRun, listAiEvaluationDatasets, runAiEvaluation } from "../apps/api/src/ai-evaluation";
import { loadConfig } from "../apps/api/src/config";

const POLL_INTERVAL_MS = 1_000;
const DEFAULT_SMOKE_CASES = 3;

const { datasetId, full } = parseArguments(process.argv.slice(2));
const config = loadConfig();
const datasets = await listAiEvaluationDatasets(config);
const dataset = datasetId
  ? datasets.find((item) => item.id === datasetId)
  : datasets.find((item) => item.name === "Golden Suite v1");

if (!dataset) throw new Error("Create and activate Golden Suite v1 in the app before running CLI verification");
if (!dataset.goldCaseCount) throw new Error("Golden Suite v1 has no active gold cases");

const run = await runAiEvaluation(config, {
  datasetId: dataset.id,
  confirmTargetExecution: true,
  judgeEnabled: false,
  confirmLlmJudge: false,
  topK: 8,
  maxCases: full ? dataset.goldCaseCount : Math.min(DEFAULT_SMOKE_CASES, dataset.goldCaseCount),
  maxJudgeCalls: 0,
  maxTotalTokens: 20_000,
  rubricVersion: "groundedness-v1",
});

process.stdout.write(`Evaluation queued: ${run.id}\n`);
let latest = run;
while (latest.status === "queued" || latest.status === "running") {
  await wait(POLL_INTERVAL_MS);
  const refreshed = await getAiEvaluationRun(config, run.id);
  if (!refreshed) throw new Error("Queued evaluation run no longer exists");
  latest = refreshed;
  process.stdout.write(`Progress: ${String(latest.summary.completedCases ?? 0)}/${String(latest.summary.caseCount ?? 0)}\n`);
}

process.stdout.write(`${JSON.stringify({
  status: latest.status,
  cases: latest.summary.caseCount,
  completedCases: latest.summary.completedCases,
  failedCases: latest.summary.failedCases,
  durationMs: latest.durationMs,
}, null, 2)}\n`);
if (latest.status !== "succeeded") process.exitCode = 1;

function parseArguments(arguments_: string[]) {
  let datasetId: string | undefined;
  let full = false;
  for (const argument of arguments_) {
    if (argument === "--full") {
      full = true;
      continue;
    }
    if (!datasetId) {
      datasetId = argument;
      continue;
    }
    throw new Error("Usage: ./manage.sh eval [dataset UUID] [--full]");
  }
  return { datasetId, full };
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
