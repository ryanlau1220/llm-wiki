import type {
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResult,
} from "../types";

export type OpenAIEmbeddingConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  dimensions?: number;
};

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly dimensions: number;

  constructor(config: OpenAIEmbeddingConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    this.baseUrl = config.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    this.model = config.model || process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
    this.dimensions = config.dimensions || 768;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    if (!this.apiKey) {
      throw new Error(`API key is missing for OpenAI-compatible embedding provider targeting model: ${this.model}`);
    }

    const body: Record<string, any> = {
      model: this.model,
      input: request.texts,
    };

    // Inject dimensions parameter if standard text-embedding-3 is used (to compress size to 768)
    // or if dimensions is explicitly requested
    if (this.model.includes("text-embedding-3")) {
      body.dimensions = this.dimensions;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`,
    };

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI-compatible embedding call failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      data: {
        index: number;
        embedding: number[];
      }[];
      model: string;
    };

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error("Invalid response structure received from OpenAI-compatible embedding endpoint");
    }

    // Sort responses by index to ensure order is preserved
    const sorted = [...data.data].sort((a, b) => a.index - b.index);
    const vectors = sorted.map((item) => item.embedding);

    return {
      vectors,
      model: {
        provider: this.name,
        model: this.model,
        dimensions: vectors[0]?.length || this.dimensions,
      },
    };
  }
}
