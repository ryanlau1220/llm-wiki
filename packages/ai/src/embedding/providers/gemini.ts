import { z } from "zod";

import type {
  EmbeddingModelInfo,
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResult
} from "../types";

const GEMINI_EMBEDDING_RESPONSE_SCHEMA = z.object({
  embedding: z.object({
    values: z.array(z.number())
  })
});

export type GeminiEmbeddingConfig = {
  apiKey?: string;
  model?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
};

const DEFAULT_MODEL = "gemini-embedding-001";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = "gemini-enterprise-agent-platform";
  readonly model: string;

  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly apiBaseUrl: string;

  constructor(config: GeminiEmbeddingConfig = {}) {
    const apiKey = config.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required for Gemini embeddings");
    }

    this.apiKey = apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.apiBaseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE_URL;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    if (!request.texts.length) {
      return {
        vectors: [],
        model: this.getModelInfo(undefined)
      };
    }

    const vectors: number[][] = [];
    for (const text of request.texts) {
      vectors.push(await this.embedSingleText(text));
    }

    return {
      vectors,
      model: this.getModelInfo(vectors[0]?.length)
    };
  }

  private async embedSingleText(text: string): Promise<number[]> {
    if (!text.trim()) {
      throw new Error("Embedding input text must be non-empty");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = `${this.apiBaseUrl}/models/${encodeURIComponent(this.model)}:embedContent?key=${encodeURIComponent(this.apiKey)}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          content: {
            parts: [
              {
                text
              }
            ]
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini embed request failed with ${response.status}: ${errorText}`);
      }

      const json = await response.json();
      const parsed = GEMINI_EMBEDDING_RESPONSE_SCHEMA.safeParse(json);
      if (!parsed.success) {
        throw new Error(`Unexpected Gemini embedding response shape: ${parsed.error.message}`);
      }

      return parsed.data.embedding.values;
    } finally {
      clearTimeout(timeout);
    }
  }

  private getModelInfo(dimensions: number | undefined): EmbeddingModelInfo {
    return {
      provider: this.name,
      model: this.model,
      dimensions
    };
  }
}
