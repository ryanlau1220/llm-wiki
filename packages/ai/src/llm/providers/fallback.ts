import type { LLMProvider, LLMRequest, LLMResponse } from "../types";

export class FallbackLLMProvider implements LLMProvider {
  readonly name = "fallback";
  readonly model: string;
  private readonly providers: { provider: LLMProvider; name: string }[];

  constructor(providers: { provider: LLMProvider; name: string }[]) {
    this.providers = providers;
    this.model = providers.map((p) => p.name).join(" -> ") || "empty-chain";
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    if (this.providers.length === 0) {
      throw new Error("No LLM providers available in the fallback chain. Please configure at least one API key.");
    }

    let lastError: Error | null = null;

    for (const { provider, name } of this.providers) {
      try {
        // Call the provider
        return await provider.generate(request);
      } catch (err: any) {
        console.warn(`[AI Fallback] Provider "${name}" failed, falling back. Error: ${err.message || err}`);
        lastError = err;
      }
    }

    throw new Error(`All LLM providers in fallback chain failed. Last error: ${lastError?.message || lastError}`);
  }
}
