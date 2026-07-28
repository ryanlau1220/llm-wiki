import { describe, expect, test } from "bun:test";

import { formatRetrievalRecall, reviewResponseToPrefill } from "./AiGeneratorEvaluate";

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
});
