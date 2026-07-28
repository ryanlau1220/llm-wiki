type EvaluationRunSummary = { id: string };
type Comparison = { baselineRunId: string; candidateRunId: string; retrievalRecallDelta: number | null; judgeScoreDelta: number | null; failedCaseDelta: number };

/** Keep the API response anchored to the two selected immutable run records. */
export function buildAiEvaluationComparison<T extends EvaluationRunSummary>(baseline: T, candidate: T, comparison: Comparison) {
  if (baseline.id === candidate.id) throw new Error("Select two distinct evaluation runs");
  if (comparison.baselineRunId !== baseline.id || comparison.candidateRunId !== candidate.id) throw new Error("Evaluation comparison does not match selected runs");
  return { baseline, candidate, comparison };
}
