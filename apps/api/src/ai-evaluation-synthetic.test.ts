import { describe, expect, test } from "bun:test";

import {
  buildDeterministicBaselineCases,
  buildDeterministicBaselineSuite,
} from "./ai-evaluation-synthetic";

describe("deterministic evaluation baseline", () => {
  test("derives repeatable note-title probes bound to exact indexed evidence", () => {
    const sources = [
      { documentPath: "AI/RAG.md", chunkIndex: 0 },
      { documentPath: "important/Tech-Stack.md", chunkIndex: 2 },
    ];

    expect(buildDeterministicBaselineCases(sources)).toEqual([
      expect.objectContaining({
        label: "Indexed note: RAG",
        redactedInput: "What does RAG cover?",
        expectedEvidence: [{ documentPath: "AI/RAG.md", chunkIndex: 0 }],
        generationMetadata: {
          generator: "deterministic_indexed_evidence",
          sourceCount: 2,
          corpusFingerprint: expect.any(String),
        },
      }),
      expect.objectContaining({
        label: "Indexed note: Tech Stack",
        redactedInput: "What does Tech Stack cover?",
        expectedEvidence: [{ documentPath: "important/Tech-Stack.md", chunkIndex: 2 }],
      }),
    ]);
  });

  test("does not require source text or an LLM to construct probes", () => {
    const cases = buildDeterministicBaselineCases([
      { documentPath: "Private/Meeting Notes.md", chunkIndex: 1 },
    ]);
    expect(cases[0].redactedInput).toBe("What does Meeting Notes cover?");
    expect(JSON.stringify(cases[0])).not.toContain("local_ollama");
  });

  test("records a corpus fingerprint alongside baseline source identities", () => {
    const base = buildDeterministicBaselineSuite([
      { documentPath: "AI/RAG.md", chunkIndex: 0, contentHash: "first" },
    ]);
    const changed = buildDeterministicBaselineSuite([
      { documentPath: "AI/RAG.md", chunkIndex: 0, contentHash: "second" },
    ]);

    expect(base.corpusFingerprint).not.toBe(changed.corpusFingerprint);
    expect(base.cases[0]?.generationMetadata.corpusFingerprint).toBe(base.corpusFingerprint);
  });
});
