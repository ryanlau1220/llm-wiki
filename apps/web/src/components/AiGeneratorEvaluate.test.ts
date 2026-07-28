import { describe, expect, test } from "bun:test";

import { reviewResponseToPrefill } from "./AiGeneratorEvaluate";

describe("response review prefill", () => {
  test("uses only the current response data and source paths", () => {
    expect(
      reviewResponseToPrefill("What is RAG?", "A retrieval workflow", [{ path: "AI/RAG.md" }, {}]),
    ).toEqual({
      name: "Review: What is RAG?",
      input: "What is RAG?",
      output: "A retrieval workflow",
      evidencePaths: ["AI/RAG.md"],
    });
  });
});
