/**
 * The only payload allowed to leave the local process for an explicitly
 * confirmed judge run. Structural trace provenance is deliberately absent.
 */
export function buildAiEvaluationJudgePrompt(item: {
  redacted_input: string;
  expected_evidence: unknown;
  expected_outcome: string | null;
  reference_answer: string | null;
  candidate_output: string | null;
  retrieved_evidence: unknown;
}) {
  return JSON.stringify({
    redactedInput: item.redacted_input,
    expectedEvidence: item.expected_evidence,
    expectedOutcome: item.expected_outcome,
    referenceAnswer: item.reference_answer,
    candidateOutput: item.candidate_output,
    retrievedEvidence: item.retrieved_evidence,
  });
}
