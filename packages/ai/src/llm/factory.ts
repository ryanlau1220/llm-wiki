import { GeminiLLMProvider } from "./providers/gemini";
import { GeminiGeapLLMProvider } from "./providers/gemini-geap";
import { OllamaLLMProvider, type OllamaLLMConfig } from "./providers/ollama";
import type { LLMProvider } from "./types";

export type LLMProviderType = "gemini" | "gemini-geap" | "ollama";

export interface LLMProviderConfig {
  provider: LLMProviderType;
  geminiApiKey?: string;
  geminiGeap?: {
    projectId?: string;
    location?: string;
    model?: string;
  };
  ollama?: OllamaLLMConfig;
  model?: string;
}

export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
  const provider = config.provider ?? (process.env.GOOGLE_CLOUD_PROJECT ? "gemini-geap" : "gemini");

  switch (provider) {
    case "gemini-geap": {
      return new GeminiGeapLLMProvider({
        projectId: config.geminiGeap?.projectId,
        location: config.geminiGeap?.location,
        model: config.model || config.geminiGeap?.model
      });
    }
    case "gemini": {
      const apiKey = config.geminiApiKey ?? process.env.GEMINI_API_KEY;
      if (!apiKey && process.env.GOOGLE_CLOUD_PROJECT) {
        // Fallback to GEAP if we are on GCP but no API key is provided
        return new GeminiGeapLLMProvider({
          projectId: config.geminiGeap?.projectId,
          location: config.geminiGeap?.location,
          model: config.model || config.geminiGeap?.model
        });
      }
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is required for 'gemini' provider when not on GCP");
      }
      return new GeminiLLMProvider({
        apiKey,
        model: config.model
      });
    }
    case "ollama": {
      return new OllamaLLMProvider(config.ollama);
    }
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}
