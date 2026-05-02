import type { LLMProvider, LLMRequest, LLMResponse } from "../types";

export type OllamaLLMConfig = {
  baseUrl?: string;
  model?: string;
};

export class OllamaLLMProvider implements LLMProvider {
  readonly name = "ollama";
  readonly model: string;
  private readonly baseUrl: string;

  constructor(config: OllamaLLMConfig = {}) {
    this.baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    this.model = config.model || process.env.OLLAMA_LLM_MODEL || "llama3";
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt: request.prompt,
        stream: false,
        options: {
          temperature: request.temperature,
          num_predict: request.maxOutputTokens,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama generation failed: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as { response: string };
    
    return {
      text: data.response,
    };
  }
}
