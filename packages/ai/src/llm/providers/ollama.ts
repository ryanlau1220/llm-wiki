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
        system: request.systemInstruction,
        format: request.responseMimeType === "application/json" ? "json" : undefined,
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

    const data = (await response.json()) as {
      response: string;
      prompt_eval_count?: number;
      eval_count?: number;
    };
    const promptTokens = usageCount(data.prompt_eval_count);
    const candidatesTokens = usageCount(data.eval_count);
    
    return {
      text: data.response,
      usage: {
        promptTokens,
        candidatesTokens,
        totalTokens: promptTokens + candidatesTokens,
      },
    };
  }
}

function usageCount(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}
