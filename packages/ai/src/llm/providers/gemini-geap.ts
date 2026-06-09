import { GoogleAuth } from "google-auth-library";
import type { LLMProvider, LLMRequest, LLMResponse } from "../types";

export interface GeminiGeapLLMConfig {
  projectId?: string;
  location?: string;
  model?: string;
  timeoutMs?: number;
  apiBaseUrl?: string;
}

// Prefer stable model IDs by default; override via GEMINI_GCP_LLM_MODEL.
const DEFAULT_MODEL = "gemini-2.5-flash";
// Default to the global endpoint for broader availability unless you need a specific region.
const DEFAULT_LOCATION = "global";
const DEFAULT_TIMEOUT_MS = 60_000;
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export class GeminiGeapLLMProvider implements LLMProvider {
  private readonly projectId: string;
  private readonly location: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly apiBaseUrl: string;
  private readonly auth: GoogleAuth;

  constructor(config: GeminiGeapLLMConfig = {}) {
    this.projectId =
      config.projectId ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? "";
    if (!this.projectId) {
      throw new Error(
        "GOOGLE_CLOUD_PROJECT (or config.projectId) is required for Gemini GEAP LLM"
      );
    }

    this.location = config.location ?? process.env.GEMINI_GCP_LOCATION ?? DEFAULT_LOCATION;
    this.model = config.model ?? process.env.GEMINI_GCP_LLM_MODEL ?? DEFAULT_MODEL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.apiBaseUrl =
      config.apiBaseUrl ??
      (this.location === "global"
        ? "https://aiplatform.googleapis.com/v1"
        : `https://${this.location}-aiplatform.googleapis.com/v1`);
    this.auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const token = await this.getAccessToken();
    const url = `${this.apiBaseUrl}/projects/${encodeURIComponent(this.projectId)}/locations/${encodeURIComponent(this.location)}/publishers/google/models/${encodeURIComponent(this.model)}:generateContent`;

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
        responseMimeType: request.webSearch ? undefined : request.responseMimeType
      }
    };

    if (request.webSearch) {
      body.tools = [{ googleSearch: {} }];
    }

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
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 404) {
          throw new Error(
            [
              `Gemini GEAP LLM error (404): model was not found.`,
              `Model: ${this.model}`,
              `Project: ${this.projectId}`,
              `Location: ${this.location}`,
              `Request: POST ${url}`,
              `Fix: set GEMINI_GCP_LLM_MODEL to a model available in this location (or pass config.model).`
            ].join("\n")
          );
        }
        throw new Error(`Gemini GEAP LLM error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (typeof text !== "string") {
        throw new Error("Invalid response from Gemini GEAP API: missing text content");
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

  private async getAccessToken(): Promise<string> {
    const client = await this.auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;

    if (!token) {
      throw new Error("Failed to acquire access token from Application Default Credentials");
    }

    return token;
  }
}
