import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, FlaskConical, Loader2, Play } from "lucide-react";
import { orpc } from "../lib/orpc";

type Props = { onBack: () => void };

export function AiGeneratorEvaluate({ onBack }: Props) {
  const capabilitiesQuery = useQuery(orpc.getAiEvaluationCapabilities.queryOptions());
  const runsQuery = useQuery(
    orpc.listAiEvaluationRuns.queryOptions({
      refetchInterval: (query: any) => query.state.data?.some((run: any) => run.status === "queued" || run.status === "running") ? 1_500 : false,
    } as any),
  );
  const automaticComparison = selectAutomaticComparisonRuns(runsQuery.data ?? []);
  const comparisonQuery = useQuery(
    orpc.compareAiEvaluationRuns.queryOptions({
      input: automaticComparison ?? { baselineRunId: "", candidateRunId: "" },
      enabled: Boolean(automaticComparison),
    } as any),
  );
  const runMutation = useMutation(
    orpc.runAiEvaluation.mutationOptions({
      onSuccess: () => {
        runsQuery.refetch();
      },
    }),
  );
  const run = () => {
    const judgeEnabled = Boolean(capabilitiesQuery.data?.semanticJudgeAvailable);
    runMutation.mutate({
      confirmTargetExecution: true,
      judgeEnabled,
      // Provider configuration is the consent boundary: cloud judging is
      // available only with ALLOW_CLOUD_VAULT_EVALUATION=true.
      confirmLlmJudge: judgeEnabled,
      topK: 8,
      maxCases: 25,
      maxJudgeCalls: 25,
      maxTotalTokens: 20_000,
      rubricVersion: "groundedness-v1",
    });
  };
  return (
    <section className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-bold text-lagoon-deep hover:underline"
      >
        <ChevronLeft size={16} /> AI Assistant
      </button>
      <header>
        <h1 className="display-title text-3xl font-bold text-sea-ink">Evaluate AI Generator</h1>
      </header>
      <div className="island-shell space-y-4 rounded-xl p-5">
          <div className="flex items-center gap-2">
            <FlaskConical size={17} />
            <h2 className="font-extrabold text-sea-ink">Quality checks</h2>
          </div>
          <button
            type="button"
            disabled={runMutation.isPending}
            onClick={run}
            className="inline-flex items-center gap-2 rounded-lg bg-sea-ink px-3 py-2 text-sm font-bold text-bg-base disabled:opacity-50"
          >
            {runMutation.isPending ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <Play size={15} />
            )}{" "}
            {runMutation.isPending ? "Preparing checks" : "Run quality checks"}
          </button>
          {runMutation.isError && (
            <p className="flex gap-1 text-sm text-red-700 dark:text-red-300">
              <AlertTriangle size={16} /> Evaluation could not run. Confirm the local database and
              evaluator configuration.
            </p>
          )}
          <RunHistory
            runs={runsQuery.data ?? []}
            automaticComparison={automaticComparison}
            comparison={comparisonQuery.data}
          />
      </div>
    </section>
  );
}

function RunHistory({
  runs,
  automaticComparison,
  comparison,
}: {
  runs: any[];
  automaticComparison: { baselineRunId: string; candidateRunId: string } | null;
  comparison: any;
}) {
  return (
    <div className="border-t border-line pt-4">
      <h3 className="font-extrabold text-sea-ink">Recent checks</h3>
      {runs.length === 0 ? (
        <p className="mt-2 text-sm text-sea-ink-soft">No runs for this dataset yet.</p>
      ) : (
        <>
          {comparison ? (
            <ComparisonCards comparison={comparison} />
          ) : !automaticComparison ? (
            <p className="mt-2 text-sm text-sea-ink-soft">Run again to compare with this result.</p>
          ) : null}
          <div className="mt-3 space-y-2">
            {runs.map((run) => (
              <div key={run.id} className="rounded-lg bg-foam p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <b className="text-sea-ink">
                    {formatDatasetRunTitle(run.datasetName, run.datasetVersion, run.rubricVersion)}
                  </b>
                  <span className={run.status === "succeeded" ? "text-green-700" : run.status === "queued" || run.status === "running" ? "text-lagoon-deep" : "text-red-700"}>
                    {run.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-sea-ink-soft">
                  {String(run.workflowManifest?.target ?? "ask_rag")} ·{" "}
                  {run.evaluatorContractVersion} ·{" "}
                  {run.judgeEnabled
                    ? `${run.modelProvider ?? "configured"} / ${run.modelName ?? "model"}`
                    : "deterministic only"}{" "}
                  · {String(run.summary?.caseCount ?? 0)} case(s) ·{" "}
                  {String(run.summary?.totalTokens ?? 0)} tokens
                </p>
                {(run.status === "queued" || run.status === "running") && (
                  <p className="mt-1 text-xs text-lagoon-deep">
                    {String(run.summary?.completedCases ?? 0)} / {String(run.summary?.caseCount ?? 0)} cases complete
                  </p>
                )}
                {run.results?.map((result: any) => (
                  <div key={result.id} className="mt-2 text-xs text-sea-ink-soft">
                    <p>
                      Case {result.caseId.slice(0, 8)}: {formatRetrievalRecall(result.deterministic?.retrieval?.recallAtK)}
                      {result.judgeScore !== null && result.judgeScore !== undefined ? ` · semantic average ${formatScore(result.judgeScore)}` : ""}
                      {result.errorCode && (
                        <span className={isSemanticEvaluatorNotice(result.errorCode) ? "text-sea-ink-soft" : "text-red-300"}>
                          {" "}
                          · {formatEvaluationError(result.errorCode)}
                        </span>
                      )}
                    </p>
                    {result.deterministic?.semantic?.engine === "promptfoo" && (
                      <p className="mt-1 text-sea-ink-soft">
                        {formatPromptfooMetrics(result.deterministic.semantic.metrics)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The API returns newest runs first; keep comparisons automatic and comparable. */
export function selectAutomaticComparisonRuns(runs: Array<{ id: string; status: string }>) {
  const completed = runs.filter((run) => run.status === "succeeded");
  if (completed.length < 2) return null;
  return { baselineRunId: completed[1].id, candidateRunId: completed[0].id };
}
function ComparisonCards({ comparison }: { comparison: any }) {
  const { baseline, candidate, comparison: delta } = comparison;
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <RunCard title="Previous run" run={baseline} />
      <RunCard title="Latest run" run={candidate} />
      <div className="md:col-span-2 rounded-lg border border-lagoon bg-foam p-3 text-xs text-sea-ink">
        <b>Quality change:</b> retrieval recall {formatDelta(delta.retrievalRecallDelta)} · judge score{" "}
        {formatDelta(delta.judgeScoreDelta)} · failed cases {formatDelta(delta.failedCaseDelta)}
      </div>
    </div>
  );
}
function RunCard({ title, run }: { title: string; run: any }) {
  return (
    <div className="rounded-lg border border-line p-3 text-xs text-sea-ink">
      <b>{title}</b>
      <p className="mt-1">
        v{run.datasetVersion} · {run.rubricVersion} · {run.status}
      </p>
      <p className="mt-1 text-sea-ink-soft">
        {run.modelProvider ?? "deterministic"} / {run.modelName ?? "no model"} ·{" "}
        {String(run.summary?.totalTokens ?? 0)} tokens
      </p>
    </div>
  );
}
function formatDelta(value: number | null) {
  return value === null ? "n/a" : `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function formatDatasetRunTitle(
  datasetName: string | null | undefined,
  datasetVersion: number,
  rubricVersion: string,
) {
  return `${datasetName || "Dataset"} · v${datasetVersion} · ${rubricVersion}`;
}

export function formatRetrievalRecall(value: number | null | undefined) {
  return typeof value === "number"
    ? `${Math.round(value * 100)}% expected sources retrieved`
    : "expected sources not assessed";
}

export function formatEvaluationError(errorCode: string) {
  if (errorCode === "local_judge_invalid_response")
    return "local judge returned invalid structured output";
  if (errorCode === "local_judge_unavailable") return "local judge unavailable";
  if (errorCode === "cloud_judge_invalid_response")
    return "cloud judge returned invalid structured output";
  if (errorCode === "cloud_judge_unavailable") return "cloud judge unavailable";
  return errorCode.replaceAll("_", " ");
}

export function isSemanticEvaluatorNotice(errorCode: string) {
  return errorCode === "judge_budget_exhausted"
    || errorCode === "local_judge_invalid_response"
    || errorCode === "local_judge_unavailable"
    || errorCode === "cloud_judge_invalid_response"
    || errorCode === "cloud_judge_unavailable";
}

export function formatPromptfooMetrics(metrics: Record<string, { score?: number }> | undefined) {
  if (!metrics) return "";
  const labels: Record<string, string> = {
    "context-faithfulness": "faithfulness",
    "context-relevance": "context precision",
    "context-recall": "context recall",
    "answer-relevance": "answer relevance",
    factuality: "answer correctness",
  };
  return Object.entries(metrics)
    .filter(([, metric]) => typeof metric.score === "number")
    .map(([name, metric]) => `${labels[name] ?? name} ${formatScore(metric.score!)}`)
    .join(" · ");
}

function formatScore(value: number) {
  return `${Math.round(value * 100)}%`;
}
