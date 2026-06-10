import type { LLMProvider, LLMRequest, LLMResponse } from "../types";

export type OpenAIConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

export class OpenAILLMProvider implements LLMProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: OpenAIConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    this.baseUrl = config.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    this.model = config.model || process.env.OPENAI_LLM_MODEL || "gpt-4o-mini";
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error(`API key is missing for OpenAI-compatible provider targeting model: ${this.model}`);
    }

    const messages = [];
    if (request.systemInstruction) {
      messages.push({ role: "system", content: request.systemInstruction });
    }
    messages.push({ role: "user", content: request.prompt });

    const body: Record<string, any> = {
      model: this.model,
      messages,
      temperature: request.temperature ?? 0.1,
    };

    if (request.maxOutputTokens) {
      body.max_tokens = request.maxOutputTokens;
    }

    // Enable JSON mode if requested
    if (request.responseMimeType === "application/json") {
      body.response_format = { type: "json_object" };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`,
    };

    // Include ranking helper headers if OpenRouter is targeted
    if (this.baseUrl.includes("openrouter.ai")) {
      headers["HTTP-Referer"] = "https://github.com/ryanlau1220/llm-wiki";
      headers["X-Title"] = "LLM Wiki";
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI-compatible LLM call failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: {
        message: {
          role: string;
          content: string;
        };
      }[];
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    const choice = data.choices?.[0];
    if (!choice || !choice.message) {
      throw new Error("Invalid response structure received from OpenAI-compatible endpoint");
    }

    return {
      text: choice.message.content,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            candidatesTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }
}
