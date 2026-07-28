import { describe, expect, test } from "bun:test";
import { isPresent } from "./ai-evaluation";
import { buildAiEvaluationComparison } from "./ai-evaluation-comparison";
import { configuredAiEvaluationModelName } from "./ai-evaluation-model";
import { buildAiEvaluationJudgePrompt } from "./ai-evaluation-prompt";

describe("AI evaluation API privacy boundary", () => {
  test("sends only owner-approved case fields to a confirmed judge", () => {
    const prompt = buildAiEvaluationJudgePrompt({
      redacted_input: "Approved, redacted question",
      expected_evidence: [{ documentPath: "docs/approved.md", chunkIndex: 2 }],
      expected_outcome: "Answer only from the approved evidence",
      reference_answer: "Approved reference",
      candidate_output: "Candidate answer",
      retrieved_evidence: [{ documentPath: "docs/approved.md", chunkIndex: 2 }],
    });
    expect(prompt).toContain("Approved, redacted question");
    expect(prompt).not.toContain("source_trace_id");
    expect(prompt).not.toContain("query_hash");
    expect(JSON.parse(prompt)).toEqual({
      redactedInput: "Approved, redacted question",
      expectedEvidence: [{ documentPath: "docs/approved.md", chunkIndex: 2 }],
      expectedOutcome: "Answer only from the approved evidence",
      referenceAnswer: "Approved reference",
      candidateOutput: "Candidate answer",
      retrievedEvidence: [{ documentPath: "docs/approved.md", chunkIndex: 2 }],
    });
  });

  test("returns the selected baseline and candidate beside structured deltas", () => {
    const response = buildAiEvaluationComparison(
      { id: "baseline", status: "succeeded" }, { id: "candidate", status: "failed" },
      { baselineRunId: "baseline", candidateRunId: "candidate", retrievalRecallDelta: 0.2, judgeScoreDelta: null, failedCaseDelta: 1 },
    );
    expect(response.candidate.status).toBe("failed");
    expect(response.comparison.retrievalRecallDelta).toBe(0.2);
    expect(() => buildAiEvaluationComparison({ id: "same" }, { id: "same" }, { baselineRunId: "same", candidateRunId: "same", retrievalRecallDelta: null, judgeScoreDelta: null, failedCaseDelta: 0 })).toThrow("distinct");
  });

  test("records the configured model rather than provider internals", () => {
    expect(configuredAiEvaluationModelName({ embeddingProvider: "openai", openaiLlmModel: "gpt-4.1-mini" })).toBe("gpt-4.1-mini");
    expect(configuredAiEvaluationModelName({ embeddingProvider: "ollama", ollamaLlmModel: "qwen3" })).toBe("qwen3");
    expect(configuredAiEvaluationModelName({ embeddingProvider: "fallback" })).toBeNull();
  });

  test("omits evaluation runs that no longer resolve from list responses", () => {
    expect([{ id: "run-1" }, null, { id: "run-2" }].filter(isPresent)).toEqual([
      { id: "run-1" },
      { id: "run-2" },
    ]);
  });
});
