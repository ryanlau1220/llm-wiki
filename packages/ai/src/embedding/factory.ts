import type { EmbeddingProvider } from "./types";
import { GeminiEmbeddingProvider, type GeminiEmbeddingConfig } from "./providers/gemini";
import {
  GeminiGeapEmbeddingProvider,
  type GeminiGeapEmbeddingConfig
} from "./providers/gemini-geap";
import { OllamaEmbeddingProvider, type OllamaEmbeddingConfig } from "./providers/ollama";

export type EmbeddingProviderKind = "gemini-geap" | "gemini" | "ollama";

export type EmbeddingProviderFactoryConfig = {
  provider?: EmbeddingProviderKind;
  geminiGeap?: GeminiGeapEmbeddingConfig;
  gemini?: GeminiEmbeddingConfig;
  ollama?: OllamaEmbeddingConfig;
};

export function createEmbeddingProvider(
  config: EmbeddingProviderFactoryConfig = {}
): EmbeddingProvider {
  const provider = config.provider ?? (process.env.GOOGLE_CLOUD_PROJECT ? "gemini-geap" : "gemini");

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
    default:
      throw new Error(`Unsupported embedding provider: ${provider}`);
  }
}
