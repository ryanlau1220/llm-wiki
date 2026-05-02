import type {
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResult,
} from "../types";

export type OllamaEmbeddingConfig = {
  baseUrl?: string;
  model?: string;
};

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = "ollama";
  readonly model: string;
  private readonly baseUrl: string;

  constructor(config: OllamaEmbeddingConfig = {}) {
    this.baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    this.model = config.model || process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    const vectors: number[][] = [];

    for (const text of request.texts) {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama embedding failed: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as { embedding: number[] };
      vectors.push(data.embedding);
    }

    return {
      vectors,
      model: {
        provider: this.name,
        model: this.model,
      },
    };
  }
}
