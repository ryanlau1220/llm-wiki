import { describe, expect, test } from "bun:test";

import { evaluateRetrieval } from "./evaluation";

const CASES = [
  {
    id: "extension-pairing",
    query: "How does local extension pairing work?",
    relevant: [
      { documentPath: "research/pairing.md", chunkIndex: 0, relevance: 3 },
      { documentPath: "research/privacy.md", relevance: 1 },
    ],
  },
  {
    id: "retrieval-tracing",
    query: "What does bounded retrieval tracing store?",
    relevant: [{ documentPath: "research/tracing.md", chunkIndex: 1, relevance: 2 }],
  },
];

describe("evaluateRetrieval", () => {
  test("calculates recall, reciprocal rank, and graded nDCG at K", () => {
    const metrics = evaluateRetrieval(
      CASES,
      new Map([
        [
          "extension-pairing",
          [
            { documentPath: "research/privacy.md", chunkIndex: 4 },
            { documentPath: "research/pairing.md", chunkIndex: 0 },
          ],
        ],
        [
          "retrieval-tracing",
          [{ documentPath: "research/tracing.md", chunkIndex: 1 }],
        ],
      ]),
      2,
    );

    expect(metrics).toMatchObject({
      evaluatedCaseCount: 2,
      k: 2,
      recallAtK: 1,
      meanReciprocalRank: 1,
    });
    expect(metrics.ndcgAtK).toBeCloseTo(0.8549, 4);
    expect(metrics.cases[0]).toMatchObject({
      recallAtK: 1,
      reciprocalRank: 1,
    });
  });

  test("does not count duplicate retrieved chunks toward recall", () => {
    const metrics = evaluateRetrieval(
      [CASES[0]!],
      new Map([
        [
          "extension-pairing",
          [
            { documentPath: "research/pairing.md", chunkIndex: 0 },
            { documentPath: "research/pairing.md", chunkIndex: 0 },
          ],
        ],
      ]),
      2,
    );

    expect(metrics.recallAtK).toBe(0.5);
  });

  test("rejects invalid and ambiguous evaluation inputs", () => {
    expect(() => evaluateRetrieval([], new Map())).toThrow("At least one retrieval evaluation case");
    expect(() => evaluateRetrieval([{ ...CASES[0]!, id: "" }], new Map())).toThrow("case ID");
    expect(() => evaluateRetrieval(CASES, new Map(), 0)).toThrow("positive integer");
  });
});
