import type {
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResult,
} from "../types";

export class FallbackEmbeddingProvider implements EmbeddingProvider {
  readonly name = "fallback";
  readonly model: string;
  private readonly providers: { provider: EmbeddingProvider; name: string }[];

  constructor(providers: { provider: EmbeddingProvider; name: string }[]) {
    this.providers = providers;
    this.model = providers.map((p) => p.name).join(" -> ") || "empty-chain";
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    if (this.providers.length === 0) {
      throw new Error("No embedding providers available in the fallback chain. Please configure at least one API key.");
    }

    let lastError: Error | null = null;

    for (const { provider, name } of this.providers) {
      try {
        return await provider.embed(request);
      } catch (err: any) {
        console.warn(`[Embedding Fallback] Provider "${name}" failed, falling back. Error: ${err.message || err}`);
        lastError = err;
      }
    }

    throw new Error(`All embedding providers in fallback chain failed. Last error: ${lastError?.message || lastError}`);
  }
}
