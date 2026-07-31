import { describe, expect, test } from "bun:test";

import {
  formatDatasetRunTitle,
  formatEvaluationError,
  formatPromptfooMetrics,
  formatRetrievalRecall,
  isSemanticEvaluatorNotice,
  selectAutomaticComparisonRuns,
} from "./AiGeneratorEvaluate";

describe("evaluation metric presentation", () => {
  test("identifies each run by its saved dataset name", () => {
    expect(formatDatasetRunTitle("Runtime stack", 1, "groundedness-v1")).toBe(
      "Runtime stack · v1 · groundedness-v1",
    );
    expect(formatDatasetRunTitle(undefined, 1, "groundedness-v1")).toBe(
      "Dataset · v1 · groundedness-v1",
    );
  });

  test("does not present an unmeasured retrieval score as zero", () => {
    expect(formatRetrievalRecall(null)).toBe("expected sources not assessed");
    expect(formatRetrievalRecall(0)).toBe("0% expected sources retrieved");
    expect(formatRetrievalRecall(0.67)).toBe("67% expected sources retrieved");
  });

  test("shows bounded local judge failures without provider response content", () => {
    expect(formatEvaluationError("local_judge_invalid_response")).toBe(
      "local judge returned invalid structured output",
    );
    expect(formatEvaluationError("local_judge_unavailable")).toBe("local judge unavailable");
    expect(formatEvaluationError("cloud_judge_unavailable")).toBe("cloud judge unavailable");
    expect(isSemanticEvaluatorNotice("cloud_judge_unavailable")).toBe(true);
    expect(isSemanticEvaluatorNotice("target_execution_failed")).toBe(false);
  });

  test("labels framework-backed RAG scores without exposing evaluator payloads", () => {
    expect(formatPromptfooMetrics({
      "context-faithfulness": { score: 0.8 },
      "answer-relevance": { score: 0.75 },
    })).toBe("faithfulness 80% · answer relevance 75%");
  });

  test("automatically compares the two latest successful runs", () => {
    expect(selectAutomaticComparisonRuns([
      { id: "running", status: "running" },
      { id: "latest", status: "succeeded" },
      { id: "previous", status: "succeeded" },
    ])).toEqual({ baselineRunId: "previous", candidateRunId: "latest" });
    expect(selectAutomaticComparisonRuns([{ id: "only", status: "succeeded" }])).toBeNull();
  });
});
