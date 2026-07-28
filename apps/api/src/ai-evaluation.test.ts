import { describe, expect, test } from "bun:test";
import { isPresent } from "./ai-evaluation";
import { buildAiEvaluationComparison } from "./ai-evaluation-comparison";
import { getLocalJudgeCapability } from "./ai-evaluation-execution";

describe("AI evaluation API privacy boundary", () => {
  test("enables semantic evaluation only when an Ollama runtime is configured", () => {
    expect(getLocalJudgeCapability({})).toEqual({
      localJudgeAvailable: false,
      localJudgeModel: null,
    });
    expect(getLocalJudgeCapability({ ollamaBaseUrl: "http://127.0.0.1:11434", ollamaLlmModel: "qwen3" })).toEqual({
      localJudgeAvailable: true,
      localJudgeModel: "qwen3",
    });
    expect(getLocalJudgeCapability({ ollamaBaseUrl: "http://127.0.0.1:11434" })).toEqual({
      localJudgeAvailable: true,
      localJudgeModel: "llama3",
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

  test("omits evaluation runs that no longer resolve from list responses", () => {
    expect([{ id: "run-1" }, null, { id: "run-2" }].filter(isPresent)).toEqual([
      { id: "run-1" },
      { id: "run-2" },
    ]);
  });
});
