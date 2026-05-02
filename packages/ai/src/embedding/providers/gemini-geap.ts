import { GoogleAuth } from "google-auth-library";
import { z } from "zod";

import type {
  EmbeddingModelInfo,
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResult
} from "../types";

const PREDICTION_SCHEMA = z.object({
  embeddings: z.object({
    values: z.array(z.number())
  })
});

const PREDICT_RESPONSE_SCHEMA = z.object({
  predictions: z.array(PREDICTION_SCHEMA).min(1)
});

export type GeminiGeapEmbeddingConfig = {
  projectId?: string;
  location?: string;
  model?: string;
  timeoutMs?: number;
  apiBaseUrl?: string;
};

const DEFAULT_MODEL = "gemini-embedding-2";
const DEFAULT_LOCATION = "us-central1";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_API_BASE_URL = "https://aiplatform.googleapis.com/v1";
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export class GeminiGeapEmbeddingProvider implements EmbeddingProvider {
  readonly name = "gemini-enterprise-agent-platform";
  readonly model: string;

  private readonly projectId: string;
  private readonly location: string;
  private readonly timeoutMs: number;
  private readonly apiBaseUrl: string;
  private readonly auth: GoogleAuth;

  constructor(config: GeminiGeapEmbeddingConfig = {}) {
    this.projectId =
      config.projectId ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? "";
    if (!this.projectId) {
      throw new Error(
        "GOOGLE_CLOUD_PROJECT (or config.projectId) is required for Gemini Enterprise embeddings"
      );
    }

    this.location = config.location ?? process.env.GEMINI_GCP_LOCATION ?? DEFAULT_LOCATION;
    this.model = config.model ?? DEFAULT_MODEL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.apiBaseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    this.auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });
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

    const token = await this.getAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = `${this.apiBaseUrl}/projects/${encodeURIComponent(this.projectId)}/locations/${encodeURIComponent(this.location)}/publishers/google/models/${encodeURIComponent(this.model)}:predict`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          instances: [
            {
              content: text
            }
          ]
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini GEAP embed request failed with ${response.status}: ${errorText}`);
      }

      const json = await response.json();
      const parsed = PREDICT_RESPONSE_SCHEMA.safeParse(json);
      if (!parsed.success) {
        throw new Error(`Unexpected Gemini GEAP embedding response shape: ${parsed.error.message}`);
      }

      return parsed.data.predictions[0].embeddings.values;
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

  private getModelInfo(dimensions: number | undefined): EmbeddingModelInfo {
    return {
      provider: this.name,
      model: this.model,
      dimensions
    };
  }
}
