import { describe, expect, test } from "bun:test";
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
});
