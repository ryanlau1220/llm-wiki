type EvaluationModelConfig = {
  embeddingProvider: "gemini-geap" | "gemini" | "ollama" | "openai" | "fallback";
  gcpLlmModel?: string;
  ollamaLlmModel?: string;
  openaiLlmModel?: string;
};

/** Model metadata is a configured value, not an implementation detail of a provider wrapper. */
export function configuredAiEvaluationModelName(config: EvaluationModelConfig): string | null {
  switch (config.embeddingProvider) {
    case "gemini-geap":
    case "gemini": return config.gcpLlmModel ?? null;
    case "ollama": return config.ollamaLlmModel ?? null;
    case "openai": return config.openaiLlmModel ?? null;
    case "fallback": return config.openaiLlmModel ?? config.gcpLlmModel ?? config.ollamaLlmModel ?? null;
  }
}
