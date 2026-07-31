import { createEmbeddingProvider, createLLMProvider } from "@llm-wiki/ai";

import type { AppConfig } from "./config";

/**
 * Generation and embeddings intentionally use separate providers. Keeping both
 * constructions here prevents local provider settings from drifting between
 * watcher, reindex, retrieval, and evaluation paths.
 */
export function createConfiguredEmbeddingProvider(config: AppConfig) {
  return createEmbeddingProvider({
    provider: config.embeddingProvider,
    gemini: {
      apiKey: config.geminiApiKey,
      model: config.gcpEmbeddingModel,
    },
    geminiGeap: {
      projectId: config.gcpProjectId,
      location: config.gcpLocation,
      model: config.gcpEmbeddingModel,
    },
    ollama: {
      baseUrl: config.ollamaBaseUrl,
      model: config.ollamaEmbeddingModel,
    },
    openai: {
      apiKey: config.openaiApiKey,
      baseUrl: config.openaiBaseUrl,
      model: config.openaiEmbeddingModel,
    },
  });
}

export function createConfiguredLlmProvider(config: AppConfig) {
  return createLLMProvider({
    provider: config.llmProvider,
    geminiApiKey: config.geminiApiKey,
    // The Gemini API adapter uses the generic model property. GEAP reads the
    // provider-specific value below.
    model: config.llmProvider === "gemini" ? config.gcpLlmModel : undefined,
    geminiGeap: {
      projectId: config.gcpProjectId,
      location: config.gcpLocation,
      model: config.gcpLlmModel,
    },
    ollama: { baseUrl: config.ollamaBaseUrl, model: config.ollamaLlmModel },
    openai: {
      apiKey: config.openaiApiKey,
      baseUrl: config.openaiBaseUrl,
      model: config.openaiLlmModel,
    },
  });
}

/** A fallback chain resolves its model dynamically, so traces must not guess. */
export function resolveConfiguredLlmModelName(config: AppConfig): string | undefined {
  switch (config.llmProvider) {
    case "ollama":
      return config.ollamaLlmModel;
    case "openai":
      return config.openaiLlmModel;
    case "gemini":
    case "gemini-geap":
      return config.gcpLlmModel;
    case "fallback":
      return undefined;
  }
}
