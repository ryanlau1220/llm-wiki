export type AcceptedGeneratorResult = {
  mode: "rag" | "general" | "synthesis" | "bootstrap";
  query: string;
  data: { traceId?: string | null };
};

export type AiTraceFeedbackSignal = "helpful" | "incorrect" | "missing_source";

/** Only a saved vault-backed answer has the provenance needed for a regression probe. */
export function acceptedRagRegressionInput(result: AcceptedGeneratorResult | null) {
  if (!result || result.mode !== "rag" || !result.data.traceId) return null;
  return { traceId: result.data.traceId, redactedInput: result.query };
}

/** Feedback uses the visible request only; trace storage remains structural. */
export function aiTraceFeedbackInput(
  result: AcceptedGeneratorResult | null,
  signal: AiTraceFeedbackSignal,
) {
  if (!result?.data.traceId) return null;
  return { traceId: result.data.traceId, signal, redactedInput: result.query };
}
