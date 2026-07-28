import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronLeft,
  FlaskConical,
  Loader2,
  Play,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { orpc } from "../lib/orpc";

export type EvaluationPrefill = {
  name: string;
  input: string;
  evidencePaths: string[];
};
type Props = { onBack: () => void; prefill?: EvaluationPrefill };

export function reviewResponseToPrefill(
  query: string,
  sources: Array<{ path?: string }> = [],
): EvaluationPrefill {
  const name = query.trim() ? `Review: ${query.trim().slice(0, 72)}` : "Review this response";
  return {
    name,
    input: query,
    evidencePaths: sources
      .map((source) => source.path)
      .filter((path): path is string => Boolean(path)),
  };
}

export function AiGeneratorEvaluate({ onBack, prefill }: Props) {
  const [name, setName] = useState("");
  const [redactedInput, setRedactedInput] = useState("");
  const [expectedEvidence, setExpectedEvidence] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [selectedDataset, setSelectedDataset] = useState<string>("");
  const [judgeEnabled, setJudgeEnabled] = useState(false);
  const [targetConfirmed, setTargetConfirmed] = useState(false);
  const [judgeConfirmed, setJudgeConfirmed] = useState(false);
  const [baselineRunId, setBaselineRunId] = useState("");
  const [candidateRunId, setCandidateRunId] = useState("");
  useEffect(() => {
    if (!prefill) return;
    setName(prefill.name);
    setRedactedInput(prefill.input);
    setExpectedEvidence(prefill.evidencePaths.join("\n"));
  }, [prefill]);
  const datasetsQuery = useQuery(orpc.listAiEvaluationDatasets.queryOptions());
  const capabilitiesQuery = useQuery(orpc.getAiEvaluationCapabilities.queryOptions());
  const runsQuery = useQuery(
    orpc.listAiEvaluationRuns.queryOptions({
      input: selectedDataset ? { datasetId: selectedDataset } : undefined,
    } as any),
  );
  const comparisonQuery = useQuery(
    orpc.compareAiEvaluationRuns.queryOptions({
      input: { baselineRunId, candidateRunId },
      enabled: Boolean(baselineRunId && candidateRunId && baselineRunId !== candidateRunId),
    } as any),
  );
  const createMutation = useMutation(
    orpc.createAiEvaluationDataset.mutationOptions({
      onSuccess: (dataset) => {
        setSelectedDataset(dataset.id);
        setName("");
        setRedactedInput("");
        setExpectedEvidence("");
        setExpectedOutcome("");
        datasetsQuery.refetch();
      },
    }),
  );
  const runMutation = useMutation(
    orpc.runAiEvaluation.mutationOptions({ onSuccess: () => runsQuery.refetch() }),
  );
  const evidence = useMemo(
    () =>
      expectedEvidence
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((documentPath) => ({ documentPath })),
    [expectedEvidence],
  );
  const submitDataset = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !redactedInput.trim()) return;
    createMutation.mutate({
      name,
      approved: true,
      cases: [
        {
          label: name,
          redactedInput,
          expectedEvidence: evidence,
          expectedOutcome: expectedOutcome || undefined,
          retrievedEvidence: [],
          retrievalEvidenceEvaluated: false,
        },
      ],
    });
  };
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
        <form onSubmit={submitDataset} className="island-shell space-y-4 rounded-xl p-5">
          <div className="flex items-center gap-2">
            <Plus size={17} />
            <h2 className="font-extrabold text-sea-ink">Create a quality check</h2>
          </div>
          <label className="block text-sm font-bold text-sea-ink">
            Check name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-surface p-2 font-normal"
              required
            />
          </label>
          <label className="block text-sm font-bold text-sea-ink">
            Redacted request
            <textarea
              value={redactedInput}
              onChange={(event) => setRedactedInput(event.target.value)}
              className="mt-1 min-h-24 w-full rounded-lg border border-line bg-surface p-2 font-normal"
              required
            />
          </label>
          <label className="block text-sm font-bold text-sea-ink">
            Expected source paths{" "}
            <span className="font-normal text-sea-ink-soft">(one per line, optional)</span>
            <textarea
              value={expectedEvidence}
              onChange={(event) => setExpectedEvidence(event.target.value)}
              className="mt-1 min-h-16 w-full rounded-lg border border-line bg-surface p-2 font-normal"
            />
          </label>
          <label className="block text-sm font-bold text-sea-ink">
            What should a good result do?
            <textarea
              value={expectedOutcome}
              onChange={(event) => setExpectedOutcome(event.target.value)}
              className="mt-1 min-h-16 w-full rounded-lg border border-line bg-surface p-2 font-normal"
            />
          </label>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-lagoon px-3 py-2 text-sm font-bold text-lagoon-text disabled:opacity-50"
          >
            {createMutation.isPending && <Loader2 className="animate-spin" size={15} />} Save
            quality check
          </button>
          {createMutation.isError && (
            <p className="text-sm text-red-700 dark:text-red-300">
              Could not save the quality check.
            </p>
          )}
        </form>
        <div className="island-shell space-y-4 rounded-xl p-5">
          <div className="flex items-center gap-2">
            <FlaskConical size={17} />
            <h2 className="font-extrabold text-sea-ink">Run and compare</h2>
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
                  {dataset.name} · v{dataset.version} · {dataset.caseCount} case(s)
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
          {capabilitiesQuery.data?.localJudgeAvailable && (
            <label className="flex gap-2 rounded-lg border border-line p-3 text-sm text-sea-ink">
              <input
                type="checkbox"
                checked={judgeEnabled}
                onChange={(event) => {
                  setJudgeEnabled(event.target.checked);
                  setJudgeConfirmed(false);
                }}
              />{" "}
              Use local semantic evaluator
            </label>
          )}
          {judgeEnabled && (
            <label className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-950/25 p-3 text-sm text-amber-100">
              <input
                type="checkbox"
                checked={judgeConfirmed}
                onChange={(event) => setJudgeConfirmed(event.target.checked)}
              />{" "}
              I confirm the local evaluator may inspect generated output and selected evidence.
            </label>
          )}
          <button
            type="button"
            disabled={!selectedDataset || !targetConfirmed || runMutation.isPending || (judgeEnabled && !judgeConfirmed)}
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
              provider configuration.
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
                    Dataset v{run.datasetVersion} · {run.rubricVersion}
                  </b>
                  <span className={run.status === "succeeded" ? "text-green-700" : "text-red-700"}>
                    {run.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-sea-ink-soft">
                  {String(run.workflowManifest?.target ?? "ask_rag")} · {run.evaluatorContractVersion} ·{" "}
                  {run.judgeEnabled
                    ? `${run.modelProvider ?? "configured"} / ${run.modelName ?? "model"}`
                    : "deterministic only"}{" "}
                  · {String(run.summary?.caseCount ?? 0)} case(s) ·{" "}
                  {String(run.summary?.totalTokens ?? 0)} tokens
                </p>
                {run.results?.map((result: any) => (
                  <p key={result.id} className="mt-1 text-xs text-sea-ink-soft">
                    Case {result.caseId.slice(0, 8)}: retrieval recall{" "}
                    {formatRetrievalRecall(result.deterministic?.retrieval?.recallAtK)} · judge{" "}
                    {result.judgeScore ?? "n/a"}
                    {result.judgeLabels?.length ? ` · ${result.judgeLabels.join(", ")}` : ""}
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

export function formatRetrievalRecall(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(2) : "not assessed";
}
