import { createWebSearchProvider, type WebSearchResult } from "@llm-wiki/ai";

import type { AppConfig } from "./config";
import {
  discoverSyndicationFeedUrlsFromPage,
  fetchSyndicationFeed,
} from "./research-radar-feed";

const SEARCH_RESULT_LIMIT = 6;
const PAGE_DISCOVERY_CONCURRENCY = 3;
const FEED_VALIDATION_CONCURRENCY = 3;
const SUGGESTION_LIMIT = 8;

export type RadarSourceSuggestion = {
  name: string;
  feedUrl: string;
  host: string;
};

function likelySyndicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /(?:rss|atom|feed|\.xml|\.json)/i.test(`${url.pathname}${url.search}`);
  } catch {
    return false;
  }
}

export function sourceDiscoveryPages(results: WebSearchResult[]): string[] {
  return [...new Set(results.map((result) => result.url).filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }))].slice(0, SEARCH_RESULT_LIMIT);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker));
  return results;
}

/** Searches only when the user asks to find public sources for a Radar. The
 * result is transient: no source is persisted until the user selects it. */
export async function discoverResearchRadarSources(config: AppConfig, topic: string): Promise<RadarSourceSuggestion[]> {
  if (!config.tavilyApiKey) throw new Error("Configure TAVILY_API_KEY to find public feed suggestions");
  const search = createWebSearchProvider({ tavily: { apiKey: config.tavilyApiKey, searchDepth: "basic" } });
  const response = await search.search({
    query: `${topic} (RSS OR Atom OR \"JSON Feed\")`,
    maxResults: SEARCH_RESULT_LIMIT,
  });
  const pages = sourceDiscoveryPages(response.results);
  const directFeeds = pages.filter(likelySyndicationUrl);
  const discoveredFeeds = (await mapWithConcurrency(pages, PAGE_DISCOVERY_CONCURRENCY, async (page) => {
    try {
      return await discoverSyndicationFeedUrlsFromPage(page);
    } catch {
      return [];
    }
  })).flat();
  const feedUrls = [...new Set([...directFeeds, ...discoveredFeeds])].slice(0, SUGGESTION_LIMIT * 2);
  const validated = await mapWithConcurrency(feedUrls, FEED_VALIDATION_CONCURRENCY, async (feedUrl) => {
    try {
      const result = await fetchSyndicationFeed({ url: feedUrl, timeoutMs: 8_000 });
      if (result.kind !== "feed") return null;
      return {
        name: result.feed.title.slice(0, 160) || new URL(feedUrl).hostname,
        feedUrl,
        host: new URL(feedUrl).hostname.replace(/^www\./, ""),
      } satisfies RadarSourceSuggestion;
    } catch {
      return null;
    }
  });
  return validated.filter((suggestion): suggestion is RadarSourceSuggestion => Boolean(suggestion)).slice(0, SUGGESTION_LIMIT);
}
