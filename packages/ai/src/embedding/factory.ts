import type { EmbeddingProvider } from "./types";
import { GeminiEmbeddingProvider, type GeminiEmbeddingConfig } from "./providers/gemini";

export type EmbeddingProviderKind = "gemini";

export type EmbeddingProviderFactoryConfig = {
  provider?: EmbeddingProviderKind;
  gemini?: GeminiEmbeddingConfig;
};

export function createEmbeddingProvider(
  config: EmbeddingProviderFactoryConfig = {}
): EmbeddingProvider {
  const provider = config.provider ?? "gemini";

  switch (provider) {
    case "gemini":
      return new GeminiEmbeddingProvider(config.gemini);
    default:
      throw new Error(`Unsupported embedding provider: ${provider satisfies never}`);
  }
}
