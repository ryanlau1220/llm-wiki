import type { LLMProvider, LLMRequest, LLMResponse } from "../types";

export interface GeminiLLMConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class GeminiLLMProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: GeminiLLMConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? "gemini-3.1-flash";
    this.baseUrl = config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta/models";
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

    const contents = [
      {
        role: "user",
        parts: [{ text: request.prompt }]
      }
    ];

    const body: any = {
      contents,
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
        responseMimeType: request.responseMimeType
      }
    };

    if (request.systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: request.systemInstruction }]
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${error}`);
      }

      const data = (await response.json()) as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (typeof text !== "string") {
        throw new Error("Invalid response from Gemini API: missing text content");
      }

      return {
        text,
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
          candidatesTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
          totalTokens: data.usageMetadata?.totalTokenCount ?? 0
        }
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
