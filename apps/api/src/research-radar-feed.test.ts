import { describe, expect, test } from "bun:test";

import { contentFingerprint, parseOpmlFeeds, parseSyndicationFeed } from "./research-radar-feed";

describe("Research Radar feed normalization", () => {
  test("normalizes RSS items with stable source data", () => {
    const feed = parseSyndicationFeed(`<?xml version="1.0"?><rss version="2.0"><channel><title>Example Feed</title><item><guid>entry-1</guid><title>AI release</title><link>https://example.com/posts/ai?utm_source=rss#top</link><description><![CDATA[<p>New <strong>AI</strong> release</p>]]></description><pubDate>Mon, 28 Jul 2026 12:00:00 GMT</pubDate><category>AI</category></item></channel></rss>`);

    expect(feed.title).toBe("Example Feed");
    expect(feed.items).toEqual([expect.objectContaining({
      externalId: "entry-1",
      canonicalUrl: "https://example.com/posts/ai",
      title: "AI release",
      content: "New AI release",
      categories: ["AI"],
    })]);
  });

  test("normalizes Atom and JSON Feed without coupling downstream code to their shapes", () => {
    const atom = parseSyndicationFeed(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><id>atom-1</id><title>Atom item</title><link href="https://example.com/atom"/><updated>2026-07-28T12:00:00Z</updated><summary>Readable summary</summary></entry></feed>`);
    const json = parseSyndicationFeed(JSON.stringify({ version: "https://jsonfeed.org/version/1.1", title: "JSON", items: [{ id: "json-1", url: "https://example.com/json", title: "JSON item", content_text: "JSON summary" }] }));

    expect(atom.items[0]).toMatchObject({ externalId: "atom-1", canonicalUrl: "https://example.com/atom", content: "Readable summary" });
    expect(json.items[0]).toMatchObject({ externalId: "json-1", canonicalUrl: "https://example.com/json", content: "JSON summary" });
  });

  test("imports nested OPML sources and rejects unsafe local URLs", () => {
    const sources = parseOpmlFeeds(`<?xml version="1.0"?><opml version="2.0"><body><outline text="Tech"><outline title="Example" xmlUrl="https://example.com/feed.xml"/></outline></body></opml>`);
    expect(sources).toEqual([{ name: "Example", feedUrl: "https://example.com/feed.xml" }]);
    expect(() => parseOpmlFeeds(`<opml><body><outline xmlUrl="http://127.0.0.1/feed"/></body></opml>`)).toThrow("public host");
  });

  test("uses canonical content to create a deterministic duplicate fingerprint", () => {
    const [item] = parseSyndicationFeed(`<?xml version="1.0"?><rss><channel><title>Example</title><item><guid>x</guid><title>Same</title><link>https://example.com/item</link><description>Body</description></item></channel></rss>`).items;
    expect(contentFingerprint(item!)).toBe(contentFingerprint(item!));
  });
});
