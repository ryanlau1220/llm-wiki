import { expect, test, describe } from "bun:test";
import { FallbackLLMProvider } from "./fallback";
import { FallbackEmbeddingProvider } from "../../embedding/providers/fallback";
import type { LLMProvider, LLMRequest, LLMResponse } from "../types";
import type { EmbeddingProvider, EmbeddingRequest, EmbeddingResult } from "../../embedding/types";

class MockLLMProvider implements LLMProvider {
  name: string;
  model = "mock-model";
  calls = 0;
  shouldFail = false;
  response: string;

  constructor(name: string, shouldFail = false, response = "success") {
    this.name = name;
    this.shouldFail = shouldFail;
    this.response = response;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    this.calls++;
    if (this.shouldFail) {
      throw new Error(`Provider ${this.name} failed deliberately`);
    }
    return { text: this.response };
  }
}

class MockEmbeddingProvider implements EmbeddingProvider {
  name: string;
  model = "mock-model";
  calls = 0;
  shouldFail = false;
  vectors: number[][];

  constructor(name: string, shouldFail = false, vectors = [[0.1, 0.2]]) {
    this.name = name;
    this.shouldFail = shouldFail;
    this.vectors = vectors;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    this.calls++;
    if (this.shouldFail) {
      throw new Error(`Provider ${this.name} failed deliberately`);
    }
    return {
      vectors: this.vectors,
      model: {
        provider: this.name,
        model: this.model,
        dimensions: this.vectors[0].length
      }
    };
  }
}

describe("FallbackLLMProvider", () => {
  test("returns immediately if the first provider succeeds", async () => {
    const p1 = new MockLLMProvider("p1", false, "p1-ok");
    const p2 = new MockLLMProvider("p2", false, "p2-ok");
    const fallback = new FallbackLLMProvider([
      { provider: p1, name: "p1" },
      { provider: p2, name: "p2" }
    ]);

    const res = await fallback.generate({ prompt: "hello" });
    expect(res.text).toBe("p1-ok");
    expect(p1.calls).toBe(1);
    expect(p2.calls).toBe(0);
  });

  test("falls back to the next provider if the first fails", async () => {
    const p1 = new MockLLMProvider("p1", true);
    const p2 = new MockLLMProvider("p2", false, "p2-ok");
    const fallback = new FallbackLLMProvider([
      { provider: p1, name: "p1" },
      { provider: p2, name: "p2" }
    ]);

    const res = await fallback.generate({ prompt: "hello" });
    expect(res.text).toBe("p2-ok");
    expect(p1.calls).toBe(1);
    expect(p2.calls).toBe(1);
  });

  test("throws an error if all providers fail", async () => {
    const p1 = new MockLLMProvider("p1", true);
    const p2 = new MockLLMProvider("p2", true);
    const fallback = new FallbackLLMProvider([
      { provider: p1, name: "p1" },
      { provider: p2, name: "p2" }
    ]);

    expect(fallback.generate({ prompt: "hello" })).rejects.toThrow(
      "All LLM providers in fallback chain failed. Last error: Provider p2 failed deliberately"
    );
    expect(p1.calls).toBe(1);
    expect(p2.calls).toBe(1);
  });
});

describe("FallbackEmbeddingProvider", () => {
  test("returns immediately if the first provider succeeds", async () => {
    const p1 = new MockEmbeddingProvider("p1", false, [[1, 2]]);
    const p2 = new MockEmbeddingProvider("p2", false, [[3, 4]]);
    const fallback = new FallbackEmbeddingProvider([
      { provider: p1, name: "p1" },
      { provider: p2, name: "p2" }
    ]);

    const res = await fallback.embed({ texts: ["hello"] });
    expect(res.vectors).toEqual([[1, 2]]);
    expect(p1.calls).toBe(1);
    expect(p2.calls).toBe(0);
  });

  test("falls back to the next provider if the first fails", async () => {
    const p1 = new MockEmbeddingProvider("p1", true);
    const p2 = new MockEmbeddingProvider("p2", false, [[3, 4]]);
    const fallback = new FallbackEmbeddingProvider([
      { provider: p1, name: "p1" },
      { provider: p2, name: "p2" }
    ]);

    const res = await fallback.embed({ texts: ["hello"] });
    expect(res.vectors).toEqual([[3, 4]]);
    expect(p1.calls).toBe(1);
    expect(p2.calls).toBe(1);
  });

  test("throws an error if all providers fail", async () => {
    const p1 = new MockEmbeddingProvider("p1", true);
    const p2 = new MockEmbeddingProvider("p2", true);
    const fallback = new FallbackEmbeddingProvider([
      { provider: p1, name: "p1" },
      { provider: p2, name: "p2" }
    ]);

    expect(fallback.embed({ texts: ["hello"] })).rejects.toThrow(
      "All embedding providers in fallback chain failed. Last error: Provider p2 failed deliberately"
    );
    expect(p1.calls).toBe(1);
    expect(p2.calls).toBe(1);
  });
});
