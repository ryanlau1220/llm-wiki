import { describe, expect, test } from "bun:test";

import { modelUsageAttributes } from "./trace-usage";

describe("model trace usage metadata", () => {
  test("stores bounded counters only", () => {
    expect(modelUsageAttributes({ promptTokens: 12, candidatesTokens: 34, totalTokens: 46 })).toEqual({
      prompt_tokens: 12,
      candidate_tokens: 34,
      total_tokens: 46,
    });
    expect(modelUsageAttributes({ promptTokens: -1, candidatesTokens: Number.POSITIVE_INFINITY, totalTokens: 20_000_000 })).toEqual({
      prompt_tokens: 0,
      candidate_tokens: 0,
      total_tokens: 10_000_000,
    });
    expect(modelUsageAttributes(undefined)).toEqual({});
  });
});
