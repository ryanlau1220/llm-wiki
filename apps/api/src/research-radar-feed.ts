import crypto from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { XMLParser, XMLValidator } from "fast-xml-parser";

const MAX_FEED_BYTES = 1_500_000;
const FEED_REQUEST_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;
const MAX_ITEM_CONTENT_CHARS = 20_000;

export type FeedItem = {
  externalId: string;
  canonicalUrl: string;
  title: string;
  content: string;
  publishedAt: Date | null;
  author: string | null;
  categories: string[];
};

export type ParsedFeed = {
  title: string;
  items: FeedItem[];
};

export type FeedFetchResult =
  | { kind: "not_modified"; etag: string | null; lastModified: string | null }
  | { kind: "feed"; feed: ParsedFeed; etag: string | null; lastModified: string | null };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function asText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (!isObject(value)) return "";
  for (const key of ["#text", "#cdata", "__cdata", "_text"]) {
    const candidate = value[key];
    if (typeof candidate === "string" || typeof candidate === "number") return String(candidate).trim();
  }
  return "";
}

function stripHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ITEM_CONTENT_CHARS);
}

function safeDate(value: unknown): Date | null {
  const text = asText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    for (const parameter of Array.from(url.searchParams.keys())) {
      if (/^(utm_|fbclid$|gclid$|mc_[ce]id$)/i.test(parameter)) url.searchParams.delete(parameter);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function itemId(value: string, url: string, title: string): string {
  const candidate = value.trim() || url || title;
  return candidate.slice(0, 1_000) || crypto.createHash("sha256").update(title).digest("hex");
}

function categoryTexts(value: unknown): string[] {
  return asArray(value)
    .flatMap((entry) => {
      if (typeof entry === "string") return [entry];
      if (!isObject(entry)) return [];
      return [asText(entry), asText(entry["@_term"]), asText(entry["@_label"])];
    })
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function feedItemFromRss(value: unknown): FeedItem | null {
  if (!isObject(value)) return null;
  const title = asText(value.title) || "Untitled feed item";
  const url = canonicalUrl(asText(value.link));
  if (!url) return null;
  const html = asText(value["content:encoded"]) || asText(value.description) || asText(value.content);
  const content = stripHtml(html) || title;
  return {
    externalId: itemId(asText(value.guid), url, title),
    canonicalUrl: url,
    title: title.slice(0, 500),
    content,
    publishedAt: safeDate(value.pubDate) ?? safeDate(value["dc:date"]),
    author: asText(value["dc:creator"]) || asText(value.author) || null,
    categories: categoryTexts(value.category),
  };
}

function atomLink(value: unknown): string | null {
  for (const link of asArray(value)) {
    if (typeof link === "string") {
      const normalized = canonicalUrl(link);
      if (normalized) return normalized;
      continue;
    }
    if (!isObject(link)) continue;
    const relation = asText(link["@_rel"]);
    const href = canonicalUrl(asText(link["@_href"]));
    if (href && (!relation || relation === "alternate")) return href;
  }
  return null;
}

function feedItemFromAtom(value: unknown): FeedItem | null {
  if (!isObject(value)) return null;
  const title = asText(value.title) || "Untitled feed item";
  const url = atomLink(value.link);
  if (!url) return null;
  const html = asText(value.content) || asText(value.summary);
  const content = stripHtml(html) || title;
  const author = isObject(value.author) ? asText(value.author.name) : asText(value.author);
  return {
    externalId: itemId(asText(value.id), url, title),
    canonicalUrl: url,
    title: title.slice(0, 500),
    content,
    publishedAt: safeDate(value.published) ?? safeDate(value.updated),
    author: author || null,
    categories: categoryTexts(value.category),
  };
}

function feedItemFromJson(value: unknown): FeedItem | null {
  if (!isObject(value)) return null;
  const title = asText(value.title) || "Untitled feed item";
  const url = canonicalUrl(asText(value.url) || asText(value.external_url));
  if (!url) return null;
  const html = asText(value.content_html) || asText(value.content_text) || asText(value.summary);
  const content = stripHtml(html) || title;
  const authors = asArray(value.authors)
    .map((author) => (isObject(author) ? asText(author.name) : ""))
    .filter(Boolean);
  return {
    externalId: itemId(asText(value.id), url, title),
    canonicalUrl: url,
    title: title.slice(0, 500),
    content,
    publishedAt: safeDate(value.date_published) ?? safeDate(value.date_modified),
    author: authors[0] ?? null,
    categories: categoryTexts(value.tags),
  };
}

export function parseSyndicationFeed(body: string): ParsedFeed {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Feed response was empty");

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isObject(parsed) || !Array.isArray(parsed.items)) throw new Error("Invalid JSON Feed");
    return {
      title: asText(parsed.title) || "Untitled feed",
      items: parsed.items.flatMap((item) => {
        const normalized = feedItemFromJson(item);
        return normalized ? [normalized] : [];
      }),
    };
  }

  if (/<!doctype/i.test(trimmed)) throw new Error("Feed XML must not include a DOCTYPE");
  const validation = XMLValidator.validate(trimmed);
  if (validation !== true) throw new Error("Feed XML is malformed");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: false,
    trimValues: true,
  });
  const parsed: unknown = parser.parse(trimmed);
  if (!isObject(parsed)) throw new Error("Feed XML did not contain an object");

  const rss = isObject(parsed.rss) ? parsed.rss : null;
  const channel = rss && isObject(rss.channel) ? rss.channel : null;
  if (channel) {
    return {
      title: asText(channel.title) || "Untitled feed",
      items: asArray(channel.item).flatMap((item) => {
        const normalized = feedItemFromRss(item);
        return normalized ? [normalized] : [];
      }),
    };
  }

  const atom = isObject(parsed.feed) ? parsed.feed : null;
  if (atom) {
    return {
      title: asText(atom.title) || "Untitled feed",
      items: asArray(atom.entry).flatMap((item) => {
        const normalized = feedItemFromAtom(item);
        return normalized ? [normalized] : [];
      }),
    };
  }

  throw new Error("Only RSS, Atom, and JSON Feed sources are supported");
}

function isPrivateAddress(address: string): boolean {
  const host = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "::" || host === "::1" || host.startsWith("fe80:") || /^f[cd][0-9a-f]{2}:/i.test(host)) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const [first, second] = ipv4.slice(1).map(Number);
  return first === 10 || first === 127 || first === 0 || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function validateRemoteUrl(value: string): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http(s) feed URLs are allowed");
  if (url.username || url.password) throw new Error("Feed URLs must not contain credentials");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || isPrivateAddress(hostname)) {
    throw new Error("Feed URLs must use a public host");
  }
  return url;
}

async function assertPublicResolution(url: URL): Promise<void> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("Feed URLs must use a public host");
    return;
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Feed URL resolved to a private address");
  }
}

async function readLimitedBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FEED_BYTES) throw new Error("Feed response exceeds the size limit");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_FEED_BYTES) {
      await reader.cancel();
      throw new Error("Feed response exceeds the size limit");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function fetchSyndicationFeed(input: {
  url: string;
  etag?: string | null;
  lastModified?: string | null;
}): Promise<FeedFetchResult> {
  let url = validateRemoteUrl(input.url);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicResolution(url);
    const headers = new Headers({
      Accept: "application/rss+xml, application/atom+xml, application/feed+json, application/xml, text/xml, application/json;q=0.9, */*;q=0.1",
      "User-Agent": "LLM-Wiki-Radar/1.0 (+local research automation)",
    });
    if (input.etag) headers.set("If-None-Match", input.etag);
    if (input.lastModified) headers.set("If-Modified-Since", input.lastModified);
    const response = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(FEED_REQUEST_TIMEOUT_MS) });
    if (response.status === 304) {
      return { kind: "not_modified", etag: input.etag ?? null, lastModified: input.lastModified ?? null };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) throw new Error("Feed redirect could not be followed safely");
      url = validateRemoteUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Feed request failed with HTTP ${response.status}`);
    const body = await readLimitedBody(response);
    return {
      kind: "feed",
      feed: parseSyndicationFeed(body),
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
    };
  }
  throw new Error("Feed redirect could not be followed safely");
}

export function parseOpmlFeeds(opml: string): Array<{ name: string; feedUrl: string }> {
  if (/<!doctype/i.test(opml)) throw new Error("OPML must not include a DOCTYPE");
  const validation = XMLValidator.validate(opml);
  if (validation !== true) throw new Error("OPML is malformed");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", processEntities: false });
  const parsed: unknown = parser.parse(opml);
  if (!isObject(parsed) || !isObject(parsed.opml) || !isObject(parsed.opml.body)) throw new Error("OPML must contain a body");
  const entries: Array<{ name: string; feedUrl: string }> = [];
  const visit = (outline: unknown) => {
    if (!isObject(outline)) return;
    const feedUrl = asText(outline["@_xmlUrl"]);
    const name = asText(outline["@_title"]) || asText(outline["@_text"]);
    if (feedUrl) {
      const validated = validateRemoteUrl(feedUrl);
      entries.push({ name: name || validated.hostname, feedUrl: validated.toString() });
    }
    for (const child of asArray(outline.outline)) visit(child);
  };
  for (const outline of asArray(parsed.opml.body.outline)) visit(outline);
  return entries;
}

export function contentFingerprint(item: FeedItem): string {
  return crypto
    .createHash("sha256")
    .update([item.canonicalUrl, item.title, item.content].join("\n"))
    .digest("hex");
}
