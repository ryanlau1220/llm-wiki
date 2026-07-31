import { expect, test } from "bun:test";

import { createConfiguredEmbeddingProvider, resolveConfiguredLlmModelName } from "./providers";

test("generation model identity follows LLM_PROVIDER, not EMBEDDING_PROVIDER", () => {
  const config = {
    embeddingProvider: "fallback",
    llmProvider: "ollama",
    ollamaLlmModel: "qwen3:8b",
    gcpLlmModel: "gemini-2.5-flash",
  } as any;

  expect(resolveConfiguredLlmModelName(config)).toBe("qwen3:8b");
});

test("a fallback chain does not claim a preselected model in traces", () => {
  expect(
    resolveConfiguredLlmModelName({
      llmProvider: "fallback",
      gcpLlmModel: "gemini-2.5-flash",
    } as any),
  ).toBeUndefined();
});

test("configured embeddings keep the Ollama model consistent across every API path", () => {
  const provider = createConfiguredEmbeddingProvider({
    embeddingProvider: "ollama",
    ollamaBaseUrl: "http://localhost:11434",
    ollamaEmbeddingModel: "nomic-embed-text:v1.5",
  } as any);

  expect(provider).toMatchObject({ name: "ollama", model: "nomic-embed-text:v1.5" });
});
