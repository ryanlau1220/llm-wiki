import { describe, expect, test } from "bun:test";

import {
  formatDatasetRunTitle,
  formatEvaluationError,
  formatRetrievalRecall,
  reviewResponseToPrefill,
} from "./AiGeneratorEvaluate";

describe("response review prefill", () => {
  test("uses the current query and source paths without carrying the generated response", () => {
    expect(reviewResponseToPrefill("What is RAG?", [{ path: "AI/RAG.md" }, {}])).toEqual({
      name: "Review: What is RAG?",
      input: "What is RAG?",
      evidencePaths: ["AI/RAG.md"],
    });
  });
});

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
  });
});
