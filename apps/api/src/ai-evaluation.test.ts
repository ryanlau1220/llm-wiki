import { describe, expect, test } from "bun:test";
import {
  isOptionalSemanticJudgeFailure,
  isPresent,
  regressionCaseDescriptor,
  selectedTraceEvidenceForRegression,
  shouldCreateRegressionFromFeedback,
  shouldRefreshBaselineCases,
} from "./ai-evaluation";
import { buildAiEvaluationComparison } from "./ai-evaluation-comparison";
import { getLocalJudgeCapability, getSemanticJudgeCapability } from "./ai-evaluation-execution";

describe("AI evaluation API privacy boundary", () => {
  test("enables semantic evaluation only when an Ollama runtime is configured", () => {
    expect(getLocalJudgeCapability({})).toEqual({
      localJudgeAvailable: false,
      localJudgeModel: null,
    });
    expect(
      getLocalJudgeCapability({ ollamaBaseUrl: "http://127.0.0.1:11434", ollamaLlmModel: "qwen3" }),
    ).toEqual({
      localJudgeAvailable: true,
      localJudgeModel: "qwen3",
    });
    expect(getLocalJudgeCapability({ ollamaBaseUrl: "http://127.0.0.1:11434" })).toEqual({
      localJudgeAvailable: true,
      localJudgeModel: "llama3",
    });
  });

  test("keeps cloud judging disabled until vault sharing is explicitly approved", () => {
    const withoutApproval = getSemanticJudgeCapability({
      evaluatorMode: "auto",
      cloudEvaluatorProvider: "gemini",
      geminiApiKey: "test-key",
      ollamaBaseUrl: "http://127.0.0.1:11434",
      ollamaLlmModel: "llama3",
    });
    expect(withoutApproval.semanticJudgeKind).toBe("local");
    expect(withoutApproval.cloudJudgeAvailable).toBe(false);

    const approved = getSemanticJudgeCapability({
      evaluatorMode: "auto",
      allowCloudVaultEvaluation: true,
      cloudEvaluatorProvider: "gemini",
      cloudEvaluatorModel: "gemini-2.5-flash",
      geminiApiKey: "test-key",
      ollamaBaseUrl: "http://127.0.0.1:11434",
      ollamaLlmModel: "llama3",
      ollamaEvaluatorModel: "qwen3:4b",
    });
    expect(approved.semanticJudgeKind).toBe("cloud");
    expect(approved.semanticJudgeModel).toBe("gemini-2.5-flash");
    expect(approved.localJudgeModel).toBe("qwen3:4b");
  });

  test("returns the selected baseline and candidate beside structured deltas", () => {
    const response = buildAiEvaluationComparison(
      { id: "baseline", status: "succeeded" },
      { id: "candidate", status: "failed" },
      {
        baselineRunId: "baseline",
        candidateRunId: "candidate",
        retrievalRecallDelta: 0.2,
        judgeScoreDelta: null,
        failedCaseDelta: 1,
      },
    );
    expect(response.candidate.status).toBe("failed");
    expect(response.comparison.retrievalRecallDelta).toBe(0.2);
    expect(() =>
      buildAiEvaluationComparison(
        { id: "same" },
        { id: "same" },
        {
          baselineRunId: "same",
          candidateRunId: "same",
          retrievalRecallDelta: null,
          judgeScoreDelta: null,
          failedCaseDelta: 0,
        },
      ),
    ).toThrow("distinct");
  });

  test("omits evaluation runs that no longer resolve from list responses", () => {
    expect([{ id: "run-1" }, null, { id: "run-2" }].filter(isPresent)).toEqual([
      { id: "run-1" },
      { id: "run-2" },
    ]);
  });

  test("creates regression targets from bounded structural evidence only", () => {
    expect(
      selectedTraceEvidenceForRegression([
        { documentPath: "vault/second.md", chunkIndex: 2, selectionRank: 2 },
        { documentPath: "vault/unselected.md", chunkIndex: 0, selectionRank: null },
        { documentPath: "vault/first.md", chunkIndex: 1, selectionRank: 1 },
      ]),
    ).toEqual([
      { documentPath: "vault/first.md", chunkIndex: 1 },
      { documentPath: "vault/second.md", chunkIndex: 2 },
    ]);
  });

  test("only negative owner feedback grows the regression suite", () => {
    expect(shouldCreateRegressionFromFeedback("helpful")).toBe(false);
    expect(shouldCreateRegressionFromFeedback("incorrect")).toBe(true);
    expect(shouldCreateRegressionFromFeedback("missing_source")).toBe(true);
  });

  test("does not label negative feedback as owner-approved evidence", () => {
    expect(regressionCaseDescriptor("missing_source").label).toBe("Reported missing source");
    expect(regressionCaseDescriptor("incorrect").expectedOutcome).toBeNull();
    expect(regressionCaseDescriptor(undefined).label).toBe("Saved response");
  });

  test("keeps the automatic baseline stable until an expected source disappears", () => {
    expect(shouldRefreshBaselineCases(6, true)).toBe(false);
    expect(shouldRefreshBaselineCases(6, false)).toBe(true);
    expect(shouldRefreshBaselineCases(0, true)).toBe(true);
  });

  test("keeps successful deterministic checks valid when optional semantic scoring is unavailable", () => {
    expect(isOptionalSemanticJudgeFailure("local_judge_unavailable")).toBe(true);
    expect(isOptionalSemanticJudgeFailure("cloud_judge_invalid_response")).toBe(true);
    expect(isOptionalSemanticJudgeFailure("target_execution_failed")).toBe(false);
  });
});
