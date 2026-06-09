import { TavilyWebSearchProvider } from "./providers/tavily";
import type { WebSearchProvider } from "./types";

export interface WebSearchConfig {
  tavily?: {
    apiKey: string;
    searchDepth?: "basic" | "advanced";
  };
}

export function createWebSearchProvider(config: WebSearchConfig): WebSearchProvider {
  if (config.tavily?.apiKey) {
    return new TavilyWebSearchProvider({
      apiKey: config.tavily.apiKey,
      searchDepth: config.tavily.searchDepth
    });
  }

  // Graceful no-op fallback when no key is supplied
  return {
    async search() {
      console.warn("[WebSearch] No active web search credentials provided in environment.");
      return { results: [] };
    }
  };
}
