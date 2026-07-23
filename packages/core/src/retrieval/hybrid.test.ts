import { describe, expect, test } from "bun:test";

import { normalizeRetrievalMetadataFilters, selectDiverseRetrievalChunks } from "./hybrid";
import type { RetrievalChunk } from "./types";

const DOCUMENT_ID_A = "8c044b88-337d-4ac4-a2d0-7ca20220c3b6";
const DOCUMENT_ID_B = "b6827de6-79cc-4e94-b56b-d5f3543fe0a9";
const DOCUMENT_ID_C = "24fedfcf-2c22-462b-a4c0-a45dc1a620b1";

describe("normalizeRetrievalMetadataFilters", () => {
  test("normalizes a vault-relative path prefix and unique document IDs", () => {
    expect(
      normalizeRetrievalMetadataFilters({
        pathPrefix: " research\\retrieval/ ",
        documentIds: [DOCUMENT_ID_A, DOCUMENT_ID_A, DOCUMENT_ID_B],
      }),
    ).toEqual({
      pathPrefix: "research/retrieval",
      documentIds: [DOCUMENT_ID_A, DOCUMENT_ID_B],
    });
  });

  test("rejects unsafe path prefixes and invalid document IDs", () => {
    expect(() => normalizeRetrievalMetadataFilters({ pathPrefix: "../important" })).toThrow();
    expect(() => normalizeRetrievalMetadataFilters({ pathPrefix: "/absolute" })).toThrow();
    expect(() => normalizeRetrievalMetadataFilters({ documentIds: ["not-a-uuid"] })).toThrow();
    expect(() => normalizeRetrievalMetadataFilters({ pathPrefix: 42 })).toThrow();
    expect(() => normalizeRetrievalMetadataFilters({ documentIds: DOCUMENT_ID_A })).toThrow();
    expect(() => normalizeRetrievalMetadataFilters({ documentIds: [] })).toThrow();
  });
});

describe("selectDiverseRetrievalChunks", () => {
  test("limits chunks per document and suppresses near-identical passages deterministically", () => {
    const selected = selectDiverseRetrievalChunks(
      [
        retrievalChunk(
          DOCUMENT_ID_A,
          "a.md",
          0,
          0.99,
          "Agents use selective retrieval and bounded context for reliable answers.",
        ),
        retrievalChunk(
          DOCUMENT_ID_A,
          "a.md",
          1,
          0.98,
          "A second distinct passage from the same document.",
        ),
        retrievalChunk(
          DOCUMENT_ID_B,
          "b.md",
          0,
          0.97,
          "Agents use selective retrieval and bounded context for reliable response.",
        ),
        retrievalChunk(
          DOCUMENT_ID_C,
          "c.md",
          0,
          0.96,
          "Evaluation traces make retrieval decisions observable and debuggable.",
        ),
      ],
      3,
      { maxChunksPerDocument: 1, nearDuplicateSimilarity: 0.8 },
    );

    expect(selected.map((chunk) => chunk.documentId)).toEqual([DOCUMENT_ID_A, DOCUMENT_ID_C]);
  });

  test("preserves ranked distinct results when no diversity rule applies", () => {
    const selected = selectDiverseRetrievalChunks(
      [
        retrievalChunk(DOCUMENT_ID_A, "a.md", 0, 0.99, "A concise answer."),
        retrievalChunk(DOCUMENT_ID_B, "b.md", 0, 0.98, "A different concise answer."),
      ],
      2,
    );

    expect(selected.map((chunk) => chunk.documentId)).toEqual([DOCUMENT_ID_A, DOCUMENT_ID_B]);
  });
});

function retrievalChunk(
  documentId: string,
  documentPath: string,
  chunkIndex: number,
  score: number,
  text: string,
): RetrievalChunk {
  return { documentId, documentPath, chunkIndex, score, text, source: "hybrid" };
}
