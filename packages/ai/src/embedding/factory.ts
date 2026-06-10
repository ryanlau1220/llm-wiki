import type { EmbeddingProvider } from "./types";
import { GeminiEmbeddingProvider, type GeminiEmbeddingConfig } from "./providers/gemini";
import {
  GeminiGeapEmbeddingProvider,
  type GeminiGeapEmbeddingConfig
} from "./providers/gemini-geap";
import { OllamaEmbeddingProvider, type OllamaEmbeddingConfig } from "./providers/ollama";
import { OpenAIEmbeddingProvider, type OpenAIEmbeddingConfig } from "./providers/openai";
import { FallbackEmbeddingProvider } from "./providers/fallback";

export type EmbeddingProviderKind = "gemini-geap" | "gemini" | "ollama" | "openai" | "fallback";

export type EmbeddingProviderFactoryConfig = {
  provider?: EmbeddingProviderKind;
  geminiGeap?: GeminiGeapEmbeddingConfig;
  gemini?: GeminiEmbeddingConfig;
  ollama?: OllamaEmbeddingConfig;
  openai?: OpenAIEmbeddingConfig;
};

export function createEmbeddingProvider(
  config: EmbeddingProviderFactoryConfig = {}
): EmbeddingProvider {
  const provider = config.provider ?? (process.env.EMBEDDING_PROVIDER as EmbeddingProviderKind) ?? "fallback";

  if (provider === "fallback") {
    const providers: { provider: EmbeddingProvider; name: string }[] = [];

    // Check if OpenAI-compatible credentials are present to build OpenAI model family chain (text-embedding-3-small)
    const bazaarLinkKey = process.env.BAZAARLINK_API_KEY;
    const openaiKey = config.openai?.apiKey ?? process.env.OPENAI_API_KEY;

    if (bazaarLinkKey || openaiKey) {
      if (bazaarLinkKey) {
        providers.push({
          provider: new OpenAIEmbeddingProvider({
            apiKey: bazaarLinkKey,
            baseUrl: process.env.BAZAARLINK_BASE_URL || "https://bazaarlink.ai/api/v1",
            model: config.openai?.model || process.env.BAZAARLINK_EMBEDDING_MODEL || "openai/text-embedding-3-small",
            dimensions: config.openai?.dimensions || 768
          }),
          name: "BazaarLink Embedding"
        });
      }
      if (openaiKey) {
        providers.push({
          provider: new OpenAIEmbeddingProvider({
            apiKey: openaiKey,
            baseUrl: config.openai?.baseUrl || process.env.OPENAI_BASE_URL,
            model: config.openai?.model || process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
            dimensions: config.openai?.dimensions || 768
          }),
          name: "OpenAI Embedding"
        });
      }
    } else {
      // Otherwise, use Gemini model family chain (gemini-embedding-001)
      const geminiKey = config.gemini?.apiKey ?? process.env.GEMINI_API_KEY;
      if (geminiKey) {
        providers.push({
          provider: new GeminiEmbeddingProvider(config.gemini),
          name: "Gemini Embedding"
        });
      }
      const hasGeap = process.env.GOOGLE_CLOUD_PROJECT;
      if (hasGeap) {
        providers.push({
          provider: new GeminiGeapEmbeddingProvider(config.geminiGeap),
          name: "Gemini GEAP Embedding"
        });
      }
    }

    // Last fallback: Ollama
    if (providers.length === 0 && (process.env.OLLAMA_BASE_URL || config.ollama?.baseUrl)) {
      providers.push({
        provider: new OllamaEmbeddingProvider(config.ollama),
        name: "Ollama Embedding"
      });
    }

    if (providers.length > 0) {
      return new FallbackEmbeddingProvider(providers);
    }

    // Final default fallback
    return new GeminiEmbeddingProvider(config.gemini);
  }

  switch (provider) {
    case "gemini-geap":
      return new GeminiGeapEmbeddingProvider(config.geminiGeap);
    case "gemini": {
      if (!config.gemini?.apiKey && !process.env.GEMINI_API_KEY && process.env.GOOGLE_CLOUD_PROJECT) {
        return new GeminiGeapEmbeddingProvider(config.geminiGeap);
      }
      return new GeminiEmbeddingProvider(config.gemini);
    }
    case "ollama":
      return new OllamaEmbeddingProvider(config.ollama);
    case "openai":
      return new OpenAIEmbeddingProvider(config.openai);
    default:
      throw new Error(`Unsupported embedding provider: ${provider}`);
  }
}
