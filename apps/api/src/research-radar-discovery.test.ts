import { describe, expect, test } from "bun:test";

import { fallbackTopicFeedUrl, sourceDiscoveryPages } from "./research-radar-discovery";

describe("Radar source discovery", () => {
  test("keeps a bounded, unique set of public search result pages", () => {
    expect(sourceDiscoveryPages([
      { title: "One", url: "https://example.com", content: "" },
      { title: "Duplicate", url: "https://example.com", content: "" },
      { title: "Unsafe", url: "file:///tmp/feed.xml", content: "" },
      { title: "Two", url: "https://updates.example.com", content: "" },
    ])).toEqual(["https://example.com", "https://updates.example.com"]);
  });

  test("creates a topic-specific fallback feed without a search API key", () => {
    expect(fallbackTopicFeedUrl("local AI events & meetups")).toBe(
      "https://news.google.com/rss/search?q=local%20AI%20events%20%26%20meetups",
    );
  });
});
