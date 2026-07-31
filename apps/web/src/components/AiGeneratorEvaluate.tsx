import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, FlaskConical, Loader2, Play, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { orpc } from "../lib/orpc";

type Props = { onBack: () => void };

export function AiGeneratorEvaluate({ onBack }: Props) {
  const [selectedDataset, setSelectedDataset] = useState<string>("");
  const [judgeEnabled, setJudgeEnabled] = useState(false);
  const [targetConfirmed, setTargetConfirmed] = useState(false);
  const [judgeConfirmed, setJudgeConfirmed] = useState(false);
  const [baselineRunId, setBaselineRunId] = useState("");
  const [candidateRunId, setCandidateRunId] = useState("");
  const datasetsQuery = useQuery(orpc.listAiEvaluationDatasets.queryOptions());
  const capabilitiesQuery = useQuery(orpc.getAiEvaluationCapabilities.queryOptions());
  const runsQuery = useQuery(
    orpc.listAiEvaluationRuns.queryOptions({
      input: selectedDataset ? { datasetId: selectedDataset } : undefined,
      refetchInterval: (query: any) => query.state.data?.some((run: any) => run.status === "queued" || run.status === "running") ? 1_500 : false,
    } as any),
  );
  const comparisonQuery = useQuery(
    orpc.compareAiEvaluationRuns.queryOptions({
      input: { baselineRunId, candidateRunId },
      enabled: Boolean(baselineRunId && candidateRunId && baselineRunId !== candidateRunId),
    } as any),
  );
  const casesQuery = useQuery(
    orpc.listAiEvaluationCases.queryOptions({
      input: { datasetId: selectedDataset },
      enabled: Boolean(selectedDataset),
    } as any),
  );
  const runMutation = useMutation(
    orpc.runAiEvaluation.mutationOptions({ onSuccess: () => runsQuery.refetch() }),
  );
  const bootstrapMutation = useMutation(
    orpc.bootstrapAiEvaluationGoldenSuite.mutationOptions({
      onSuccess: (dataset) => {
        setSelectedDataset(dataset.id);
        datasetsQuery.refetch();
      },
    }),
  );
  const activateSuiteMutation = useMutation(
    orpc.activateAiEvaluationGoldenSuite.mutationOptions({
      onSuccess: (dataset) => {
        setSelectedDataset(dataset.id);
        datasetsQuery.refetch();
      },
    }),
  );
  const discardCandidateMutation = useMutation(
    orpc.discardAiEvaluationSilverCase.mutationOptions({
      onSuccess: () => {
        datasetsQuery.refetch();
        casesQuery.refetch();
      },
    }),
  );
  const selectedSuite = datasetsQuery.data?.find((dataset) => dataset.id === selectedDataset);
  const hasGoldenSuite = datasetsQuery.data?.some((dataset) => dataset.name === "Golden Suite v1");
  const hasSilverCases = Boolean(selectedSuite && selectedSuite.silverCaseCount > 0);
  useEffect(() => {
    if (selectedDataset || !datasetsQuery.data) return;
    const golden = datasetsQuery.data.find((dataset) => dataset.name === "Golden Suite v1");
    if (golden) setSelectedDataset(golden.id);
  }, [datasetsQuery.data, selectedDataset]);
  const run = () => {
    if (!selectedDataset) return;
    runMutation.mutate({
      datasetId: selectedDataset,
      confirmTargetExecution: true,
      judgeEnabled,
      confirmLlmJudge: judgeEnabled ? judgeConfirmed : false,
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
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="island-shell space-y-4 rounded-xl p-5">
          <div className="flex items-center gap-2">
            <Sparkles size={17} />
            <h2 className="font-extrabold text-sea-ink">Golden Suite v1</h2>
          </div>
          {!hasGoldenSuite && capabilitiesQuery.data?.localJudgeAvailable && (
            <button
              type="button"
              onClick={() => bootstrapMutation.mutate({ maxCases: 6 })}
              disabled={bootstrapMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-lagoon px-3 py-2 text-sm font-bold text-lagoon-text disabled:opacity-50"
            >
              {bootstrapMutation.isPending ? <Loader2 className="animate-spin" size={15} /> : <Sparkles size={15} />}
              Build Golden Suite
            </button>
          )}
          {selectedSuite?.name === "Golden Suite v1" && hasSilverCases && (
            <button
              type="button"
              onClick={() => activateSuiteMutation.mutate({ datasetId: selectedSuite.id })}
              disabled={activateSuiteMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-lagoon px-3 py-2 text-sm font-bold text-lagoon-text disabled:opacity-50"
            >
              {activateSuiteMutation.isPending ? <Loader2 className="animate-spin" size={15} /> : <Sparkles size={15} />}
              Activate {selectedSuite.silverCaseCount} verified cases
            </button>
          )}
          {selectedSuite?.name === "Golden Suite v1" && (
            <>
              <p className="text-sm text-sea-ink-soft">
                {selectedSuite.goldCaseCount} active · {selectedSuite.silverCaseCount} awaiting activation · v{selectedSuite.version}
              </p>
              {casesQuery.data && (
                <div className="space-y-2 border-t border-line pt-3 text-sm text-sea-ink">
                  {casesQuery.data.map((evaluationCase) => (
                    <div key={evaluationCase.id} className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{evaluationCase.label}</p>
                        {evaluationCase.expectedOutcome && <p className="text-sea-ink-soft">{evaluationCase.expectedOutcome}</p>}
                      </div>
                      {evaluationCase.lifecycle === "silver" && (
                        <button
                          type="button"
                          aria-label={`Remove ${evaluationCase.label}`}
                          onClick={() => discardCandidateMutation.mutate({ caseId: evaluationCase.id })}
                          disabled={discardCandidateMutation.isPending}
                          className="shrink-0 rounded border border-line p-1 text-sea-ink-soft hover:border-red-500 hover:text-red-500 disabled:opacity-50"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {(bootstrapMutation.isError || activateSuiteMutation.isError) && (
            <p className="text-sm text-red-700 dark:text-red-300">Golden Suite v1 could not be prepared from the current index.</p>
          )}
        </div>
        <div className="island-shell space-y-4 rounded-xl p-5">
          <div className="flex items-center gap-2">
            <FlaskConical size={17} />
            <h2 className="font-extrabold text-sea-ink">Run checks</h2>
          </div>
          <label className="block text-sm font-bold text-sea-ink">
            Evaluation dataset
            <select
              value={selectedDataset}
              onChange={(event) => {
                setSelectedDataset(event.target.value);
                setBaselineRunId("");
                setCandidateRunId("");
              }}
              className="mt-1 w-full rounded-lg border border-line bg-surface p-2 font-normal"
            >
              <option value="">Select a dataset</option>
              {datasetsQuery.data?.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.name} · v{dataset.version} · {dataset.goldCaseCount} gold · {dataset.silverCaseCount} silver
                </option>
              ))}
            </select>
          </label>
          <label className="flex gap-2 rounded-lg border border-line p-3 text-sm text-sea-ink">
            <input
              type="checkbox"
              checked={targetConfirmed}
              onChange={(event) => setTargetConfirmed(event.target.checked)}
            />{" "}
            I confirm this runs the approved cases with the current Ask/RAG workflow.
          </label>
          {capabilitiesQuery.data?.semanticJudgeAvailable && (
            <label className="flex gap-2 rounded-lg border border-line p-3 text-sm text-sea-ink">
              <input
                type="checkbox"
                checked={judgeEnabled}
                onChange={(event) => {
                  setJudgeEnabled(event.target.checked);
                  setJudgeConfirmed(false);
                }}
              />{" "}
              Use semantic evaluator
            </label>
          )}
          {judgeEnabled && (
            <label className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-950/25 p-3 text-sm text-amber-100">
              <input
                type="checkbox"
                checked={judgeConfirmed}
                onChange={(event) => setJudgeConfirmed(event.target.checked)}
              />{" "}
              I confirm the {capabilitiesQuery.data?.semanticJudgeKind === "cloud" ? "configured cloud" : "local"} evaluator may inspect generated output and selected evidence.
            </label>
          )}
          <button
            type="button"
            disabled={
              !selectedDataset ||
              !selectedSuite?.goldCaseCount ||
              !targetConfirmed ||
              runMutation.isPending ||
              (judgeEnabled && !judgeConfirmed)
            }
            onClick={run}
            className="inline-flex items-center gap-2 rounded-lg bg-sea-ink px-3 py-2 text-sm font-bold text-bg-base disabled:opacity-50"
          >
            {runMutation.isPending ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <Play size={15} />
            )}{" "}
            Run Ask/RAG evaluation
          </button>
          {runMutation.isError && (
            <p className="flex gap-1 text-sm text-red-700 dark:text-red-300">
              <AlertTriangle size={16} /> Evaluation could not run. Confirm the local database and
              evaluator configuration.
            </p>
          )}
          <RunHistory
            runs={runsQuery.data ?? []}
            baselineRunId={baselineRunId}
            candidateRunId={candidateRunId}
            onBaselineChange={setBaselineRunId}
            onCandidateChange={setCandidateRunId}
            comparison={comparisonQuery.data}
          />
        </div>
      </div>
    </section>
  );
}

function RunHistory({
  runs,
  baselineRunId,
  candidateRunId,
  onBaselineChange,
  onCandidateChange,
  comparison,
}: {
  runs: any[];
  baselineRunId: string;
  candidateRunId: string;
  onBaselineChange: (id: string) => void;
  onCandidateChange: (id: string) => void;
  comparison: any;
}) {
  return (
    <div className="border-t border-line pt-4">
      <h3 className="font-extrabold text-sea-ink">Versioned run comparison</h3>
      {runs.length === 0 ? (
        <p className="mt-2 text-sm text-sea-ink-soft">No runs for this dataset yet.</p>
      ) : (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-bold text-sea-ink">
              Baseline
              <select
                value={baselineRunId}
                onChange={(event) => onBaselineChange(event.target.value)}
                className="mt-1 w-full rounded border border-line p-2 font-normal"
              >
                <option value="">Select baseline</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {new Date(run.startedAt).toLocaleString()} · {run.status}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-sea-ink">
              Candidate
              <select
                value={candidateRunId}
                onChange={(event) => onCandidateChange(event.target.value)}
                className="mt-1 w-full rounded border border-line p-2 font-normal"
              >
                <option value="">Select candidate</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {new Date(run.startedAt).toLocaleString()} · {run.status}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {comparison && <ComparisonCards comparison={comparison} />}
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
                  <p key={result.id} className="mt-1 text-xs text-sea-ink-soft">
                    Case {result.caseId.slice(0, 8)}:{" "}
                    {formatRetrievalRecall(result.deterministic?.retrieval?.recallAtK)} · judge{" "}
                    {result.judgeScore ?? "n/a"}
                    {result.judgeLabels?.length ? ` · ${result.judgeLabels.join(", ")}` : ""}
                    {result.errorCode && (
                      <span className="text-red-300">
                        {" "}
                        · {formatEvaluationError(result.errorCode)}
                      </span>
                    )}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
function ComparisonCards({ comparison }: { comparison: any }) {
  const { baseline, candidate, comparison: delta } = comparison;
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <RunCard title="Baseline" run={baseline} />
      <RunCard title="Candidate" run={candidate} />
      <div className="md:col-span-2 rounded-lg border border-lagoon bg-foam p-3 text-xs text-sea-ink">
        <b>Change:</b> retrieval recall {formatDelta(delta.retrievalRecallDelta)} · judge score{" "}
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
