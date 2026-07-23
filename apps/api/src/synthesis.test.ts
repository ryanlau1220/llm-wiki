import { describe, expect, test } from "bun:test";

import { packRetrievedSynthesisContext, packSelectedNoteSynthesisContext } from "./synthesis";

const RETRIEVAL_CHUNKS = [
  {
    documentId: "note-a",
    documentPath: "notes/a.md",
    chunkIndex: 0,
    text: "first ranked evidence",
    score: 1,
    source: "vector" as const,
  },
  {
    documentId: "note-a",
    documentPath: "notes/a.md",
    chunkIndex: 1,
    text: "second ranked evidence",
    score: 0.9,
    source: "vector" as const,
  },
  {
    documentId: "note-b",
    documentPath: "notes/b.md",
    chunkIndex: 0,
    text: "diverse evidence",
    score: 0.8,
    source: "fts" as const,
  },
];

describe("synthesis context packing", () => {
  test("uses the existing bounded, diverse packer for retrieved sources", () => {
    const context = packRetrievedSynthesisContext(RETRIEVAL_CHUNKS, {
      characterBudget: 1_000,
      chunksPerDocument: 1,
    });

    expect(context.chunks.map((chunk) => chunk.documentId)).toEqual(["note-a", "note-b"]);
    expect(context.text).toContain("[Context 1 | notes/a.md#0]");
    expect(context.text).toContain("[Context 2 | notes/b.md#0]");
    expect(context.characterCount).toBeLessThanOrEqual(1_000);
  });

  test("labels selected-note segments and keeps the manifest inside the hard budget", () => {
    const context = packSelectedNoteSynthesisContext(
      [
        {
          id: "selected-a",
          title: "Long selected note",
          path: "notes/selected-a.md",
          content: "abcdefghijkl",
        },
      ],
      {
        characterBudget: 1_000,
        segmentCharacterLimit: 3,
      },
    );

    expect(context.chunks.map((chunk) => chunk.chunkIndex)).toEqual([0, 1]);
    expect(context.text).toContain("[Context 1 | notes/selected-a.md#0]");
    expect(context.text).toContain("segment 1 of 4");
    expect(context.sourceManifest).toContain("notes/selected-a.md (4 segments)");
    expect(context.text).toContain(context.sourceManifest);
    expect(context.characterCount).toBeLessThanOrEqual(1_000);
  });

  test("keeps source provenance visible when the budget cannot fit any selected segment", () => {
    const context = packSelectedNoteSynthesisContext(
      [
        {
          id: "selected-a",
          title: "Selected note",
          path: "notes/selected-a.md",
          content: "source content that cannot fit beside the manifest",
        },
      ],
      {
        characterBudget: 220,
        segmentCharacterLimit: 100,
      },
    );

    expect(context.chunks).toEqual([]);
    expect(context.text).toBe(context.sourceManifest);
    expect(context.sourceManifest).toContain("notes/selected-a.md");
    expect(context.characterCount).toBeLessThanOrEqual(220);
  });

  test("rejects a budget that cannot label every selected source", () => {
    expect(() =>
      packSelectedNoteSynthesisContext(
        [
          {
            id: "selected-a",
            title: "Selected note",
            path: "notes/selected-a.md",
            content: "content",
          },
        ],
        { characterBudget: 10 },
      ),
    ).toThrow("label every selected source");
  });
});
