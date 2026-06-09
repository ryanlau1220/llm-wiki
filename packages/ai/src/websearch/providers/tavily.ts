import type { WebSearchProvider, WebSearchRequest, WebSearchResponse } from "../types";

export interface TavilySearchConfig {
  apiKey: string;
  searchDepth?: "basic" | "advanced";
  timeoutMs?: number;
}

export class TavilyWebSearchProvider implements WebSearchProvider {
  private readonly apiKey: string;
  private readonly searchDepth: "basic" | "advanced";
  private readonly timeoutMs: number;

  constructor(config: TavilySearchConfig) {
    this.apiKey = config.apiKey;
    this.searchDepth = config.searchDepth ?? "basic";
    this.timeoutMs = config.timeoutMs ?? 10000;
  }

  async search(request: WebSearchRequest): Promise<WebSearchResponse> {
    if (!this.apiKey) {
      throw new Error("Tavily API key is missing");
    }

    const url = "https://api.tavily.com/search";
    const body = {
      api_key: this.apiKey,
      query: request.query,
      search_depth: this.searchDepth,
      max_results: request.maxResults ?? 5,
      include_answer: false
    };

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
        const errorText = await response.text();
        throw new Error(`Tavily Search API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as any;
      
      return {
        results: (data.results || []).map((r: any) => ({
          title: r.title || "",
          url: r.url || "",
          content: r.content || "",
          score: r.score
        }))
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
