import { expect, test } from "bun:test";
import { rerankRetrievalChunks } from "./rerank";

test("reranks fused candidates by query-term coverage", () => {
  const ranked = rerankRetrievalChunks("local pairing", [
    { documentId: "a", documentPath: "a.md", chunkIndex: 0, text: "unrelated", score: 1, source: "vector" },
    { documentId: "b", documentPath: "b.md", chunkIndex: 0, text: "local browser pairing", score: 0.9, source: "hybrid" },
  ]);
  expect(ranked[0]?.documentId).toBe("b");
});
