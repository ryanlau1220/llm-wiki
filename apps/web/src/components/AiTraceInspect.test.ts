import { describe, expect, test } from "bun:test";

import { buildSpanTree, pageButtons } from "./AiTraceInspect";

describe("AI trace span tree", () => {
  test("nests child spans under their parent while preserving orphan spans", () => {
    const tree = buildSpanTree([
      { id: "request", parentSpanId: null },
      { id: "model", parentSpanId: "request" },
      { id: "retry", parentSpanId: "model" },
      { id: "orphan", parentSpanId: "missing" },
    ]);

    expect(tree.map((node) => node.span.id)).toEqual(["request", "orphan"]);
    expect(tree[0]?.children[0]?.span.id).toBe("model");
    expect(tree[0]?.children[0]?.children[0]?.span.id).toBe("retry");
  });
});

describe("trace cursor pagination", () => {
  test("shows actual final page numbers with compact ellipses", () => {
    expect(pageButtons(12, 1)).toEqual([1, 2, "ellipsis", 12]);
    expect(pageButtons(12, 6)).toEqual([1, 2, "ellipsis", 5, 6, 7, "ellipsis", 12]);
    expect(pageButtons(3, 2)).toEqual([1, 2, 3]);
  });
});
