import { describe, expect, test } from "bun:test";

import { packRetrievalContext } from "./context";

const CHUNKS = [
  { documentId: "a", documentPath: "a.md", chunkIndex: 0, text: "first", score: 1, source: "vector" as const },
  { documentId: "a", documentPath: "a.md", chunkIndex: 1, text: "second", score: 0.9, source: "vector" as const },
  { documentId: "a", documentPath: "a.md", chunkIndex: 2, text: "third", score: 0.8, source: "vector" as const },
  { documentId: "b", documentPath: "b.md", chunkIndex: 0, text: "fourth", score: 0.7, source: "fts" as const },
];

describe("packRetrievalContext", () => {
  test("keeps ranked chunks diverse by document and preserves source references", () => {
    const pack = packRetrievalContext(CHUNKS, { characterBudget: 1_000, chunksPerDocument: 2 });

    expect(pack.chunks.map((chunk) => chunk.text)).toEqual(["first", "second", "fourth"]);
    expect(pack.text).toContain("a.md#0");
    expect(pack.text).toContain("b.md#0");
  });

  test("skips chunks that exceed the context budget", () => {
    const pack = packRetrievalContext(CHUNKS, { characterBudget: 25, chunksPerDocument: 2 });

    expect(pack.chunks).toEqual([]);
    expect(pack.characterCount).toBe(0);
  });

  test("rejects invalid packing options", () => {
    expect(() => packRetrievalContext(CHUNKS, { characterBudget: 0 })).toThrow("budget");
    expect(() => packRetrievalContext(CHUNKS, { chunksPerDocument: 0 })).toThrow("per document");
  });

  test("preserves extra metadata on structural context chunks", () => {
    const chunks = [
      {
        documentId: "selected-note",
        documentPath: "selected.md",
        chunkIndex: 0,
        text: "selected source",
        segmentCount: 1,
      },
    ];

    const pack = packRetrievalContext(chunks, { characterBudget: 1_000 });

    expect(pack.chunks[0]?.segmentCount).toBe(1);
  });
});
