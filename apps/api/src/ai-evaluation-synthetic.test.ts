import { describe, expect, test } from "bun:test";

import { buildLocalSilverPrompt, parseLocalSilverCases } from "./ai-evaluation-synthetic";

const sources = [
  { documentPath: "AI/RAG.md", chunkIndex: 0, text: "RAG retrieves relevant note chunks before generating an answer." },
  { documentPath: "AI/Tracing.md", chunkIndex: 2, text: "Structural traces store evidence references and duration metrics." },
];

describe("local silver evaluation candidates", () => {
  test("binds every generated case to a selected evidence item", () => {
    expect(parseLocalSilverCases(JSON.stringify({
      cases: [
        { question: "How does RAG prepare an answer?", expectedOutcome: "Mention retrieval before generation.", evidenceIndex: 0 },
        { question: "How does RAG prepare an answer?", expectedOutcome: "Duplicate should be ignored.", evidenceIndex: 0 },
        { question: "What does a structural trace store?", expectedOutcome: "Mention references and durations.", evidenceIndex: 1 },
      ],
    }), sources, 2)).toEqual([
      expect.objectContaining({ redactedInput: "How does RAG prepare an answer?", expectedEvidence: [{ documentPath: "AI/RAG.md", chunkIndex: 0 }] }),
      expect.objectContaining({ redactedInput: "What does a structural trace store?", expectedEvidence: [{ documentPath: "AI/Tracing.md", chunkIndex: 2 }] }),
    ]);
  });

  test("rejects a generator response that cannot be safely bound to evidence", () => {
    expect(() => parseLocalSilverCases(JSON.stringify({ cases: [{ question: "Unknown", expectedOutcome: "Unknown", evidenceIndex: 9 }] }), sources, 2)).toThrow("no usable");
  });

  test("does not ask the local model to produce hidden reasoning", () => {
    expect(buildLocalSilverPrompt(sources, 2)).not.toContain("chain-of-thought");
  });
});
