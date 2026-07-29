import { describe, expect, test } from "bun:test";

import { formatEvaluationError, formatRetrievalRecall, reviewResponseToPrefill } from "./AiGeneratorEvaluate";

describe("response review prefill", () => {
  test("uses the current query and source paths without carrying the generated response", () => {
    expect(
      reviewResponseToPrefill("What is RAG?", [{ path: "AI/RAG.md" }, {}]),
    ).toEqual({
      name: "Review: What is RAG?",
      input: "What is RAG?",
      evidencePaths: ["AI/RAG.md"],
    });
  });
});

describe("evaluation metric presentation", () => {
  test("does not present an unmeasured retrieval score as zero", () => {
    expect(formatRetrievalRecall(null)).toBe("not assessed");
    expect(formatRetrievalRecall(0)).toBe("0.00");
  });

  test("shows bounded local judge failures without provider response content", () => {
    expect(formatEvaluationError("local_judge_invalid_response")).toBe("local judge returned invalid structured output");
    expect(formatEvaluationError("local_judge_unavailable")).toBe("local judge unavailable");
  });
});
