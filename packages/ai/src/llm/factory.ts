import { GeminiLLMProvider } from "./providers/gemini";
import { GeminiGeapLLMProvider } from "./providers/gemini-geap";
import { OllamaLLMProvider, type OllamaLLMConfig } from "./providers/ollama";
import { OpenAILLMProvider, type OpenAIConfig } from "./providers/openai";
import { FallbackLLMProvider } from "./providers/fallback";
import type { LLMProvider } from "./types";

export type LLMProviderType = "gemini" | "gemini-geap" | "ollama" | "openai" | "fallback";

export interface LLMProviderConfig {
  provider?: LLMProviderType;
  geminiApiKey?: string;
  geminiGeap?: {
    projectId?: string;
    location?: string;
    model?: string;
  };
  ollama?: OllamaLLMConfig;
  openai?: OpenAIConfig;
  model?: string;
}

export function createLLMProvider(config: LLMProviderConfig = {}): LLMProvider {
  const provider = config.provider ?? (process.env.EMBEDDING_PROVIDER as LLMProviderType) ?? "fallback";

  if (provider === "fallback") {
    const providers: { provider: LLMProvider; name: string }[] = [];

    // 1. Groq
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      providers.push({
        provider: new OpenAILLMProvider({
          apiKey: groqKey,
          baseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
          model: config.model || process.env.GROQ_LLM_MODEL || "llama-3.3-70b-versatile"
        }),
        name: "Groq"
      });
    }

    // 2. OpenRouter
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (openRouterKey) {
      providers.push({
        provider: new OpenAILLMProvider({
          apiKey: openRouterKey,
          baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
          model: config.model || process.env.OPENROUTER_LLM_MODEL || "google/gemma-4-31b-it:free"
        }),
        name: "OpenRouter"
      });
    }

    // 3. BazaarLink
    const bazaarLinkKey = process.env.BAZAARLINK_API_KEY;
    if (bazaarLinkKey) {
      providers.push({
        provider: new OpenAILLMProvider({
          apiKey: bazaarLinkKey,
          baseUrl: process.env.BAZAARLINK_BASE_URL || "https://bazaarlink.ai/api/v1",
          model: config.model || process.env.BAZAARLINK_LLM_MODEL || "gpt-4o-mini"
        }),
        name: "BazaarLink"
      });
    }

    // 4. Gemini GEAP
    const hasGeap = process.env.GOOGLE_CLOUD_PROJECT;
    if (hasGeap) {
      providers.push({
        provider: new GeminiGeapLLMProvider({
          projectId: config.geminiGeap?.projectId,
          location: config.geminiGeap?.location,
          model: config.model || config.geminiGeap?.model
        }),
        name: "Gemini GEAP"
      });
    }

    // 5. Gemini
    const geminiKey = config.geminiApiKey ?? process.env.GEMINI_API_KEY;
    if (geminiKey) {
      providers.push({
        provider: new GeminiLLMProvider({
          apiKey: geminiKey,
          model: config.model
        }),
        name: "Gemini"
      });
    }

    // 6. Ollama
    if (process.env.OLLAMA_BASE_URL || config.ollama?.baseUrl) {
      providers.push({
        provider: new OllamaLLMProvider(config.ollama),
        name: "Ollama"
      });
    }

    // 7. OpenAI
    const openaiKey = config.openai?.apiKey ?? process.env.OPENAI_API_KEY;
    if (openaiKey) {
      providers.push({
        provider: new OpenAILLMProvider({
          apiKey: openaiKey,
          baseUrl: config.openai?.baseUrl || process.env.OPENAI_BASE_URL,
          model: config.model || config.openai?.model || process.env.OPENAI_LLM_MODEL || "gpt-4o-mini"
        }),
        name: "OpenAI"
      });
    }

    if (providers.length > 0) {
      return new FallbackLLMProvider(providers);
    }

    // Final Fallback: defaults to direct Gemini provider if key is present
    const defaultGeminiKey = process.env.GEMINI_API_KEY;
    if (defaultGeminiKey) {
      return new GeminiLLMProvider({ apiKey: defaultGeminiKey, model: config.model });
    }
    throw new Error("No LLM providers configured in env variables.");
  }

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
    case "openai": {
      return new OpenAILLMProvider({
        apiKey: config.openai?.apiKey,
        baseUrl: config.openai?.baseUrl,
        model: config.model || config.openai?.model
      });
    }
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}
