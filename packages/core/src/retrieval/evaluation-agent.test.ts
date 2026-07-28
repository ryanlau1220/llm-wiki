import { describe, expect, test } from "bun:test";
import { compareEvaluationRuns, evaluateDeterministicCase, parseJudgeEvaluation, validateAiEvaluationCase, validateEvaluationBudget } from "./evaluation";

const caseInput = {
  id: "approved-redacted-case",
  redactedInput: "How does the redacted system work?",
  expectedEvidence: [{ documentPath: "docs/system.md", chunkIndex: 0 }],
  expectedOutcome: "Answer from evidence.",
  retrievedEvidence: [{ documentPath: "docs/system.md", chunkIndex: 0 }],
  candidateOutput: "It works from cited evidence.",
};

describe("AI generator evaluator contract", () => {
  test("evaluates approved evidence without trace payloads", () => {
    const result = evaluateDeterministicCase(caseInput);
    expect(result.citationSourceValidity.passed).toBe(true);
    expect(result.retrieval?.recallAtK).toBe(1);
  });

  test("requires an explicit redacted input", () => {
    expect(() => validateAiEvaluationCase({ ...caseInput, redactedInput: " " })).toThrow("user-approved redacted");
  });

  test("parses only bounded structured judge output", () => {
    expect(parseJudgeEvaluation('{"score":0.8,"rationale":"Relevant and grounded."}')).toEqual({ score: 0.8, rationale: "Relevant and grounded." });
    expect(() => parseJudgeEvaluation('{"score":2,"rationale":"no"}')).toThrow("score");
    expect(() => parseJudgeEvaluation("hidden reasoning")).toThrow("invalid JSON");
  });

  test("enforces bounded judge and token budgets", () => {
    expect(() => validateEvaluationBudget({ caseCount: 2, judgeEnabled: true, maxCases: 2, maxJudgeCalls: 1, maxTotalTokens: 100 })).toThrow("judge-call budget");
    expect(() => validateEvaluationBudget({ caseCount: 1, judgeEnabled: false, maxCases: 1, maxJudgeCalls: 0, maxTotalTokens: 100_001 })).toThrow("token budget");
  });

  test("compares versioned structured results without accessing case payloads", () => {
    const baseline = evaluateDeterministicCase({ ...caseInput, retrievedEvidence: [] });
    const candidate = evaluateDeterministicCase(caseInput);
    const comparison = compareEvaluationRuns(
      { id: "baseline", results: [{ status: "succeeded", deterministic: baseline, judgeScore: 0.4 }] },
      { id: "candidate", results: [{ status: "succeeded", deterministic: candidate, judgeScore: 0.8 }] },
    );
    expect(comparison.retrievalRecallDelta).toBe(1);
    expect(comparison.judgeScoreDelta).toBeCloseTo(0.4);
  });
});
