import matter from "gray-matter";

import type { ParsedMarkdownDocument } from "./types";

const WIKILINK_PATTERN = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

export function extractWikiLinks(markdown: string): string[] {
  const links = new Set<string>();

  for (const match of markdown.matchAll(WIKILINK_PATTERN)) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }
    links.add(raw);
  }

  return [...links];
}

export function chunkMarkdown(content: string, chunkSize = 1000, overlap = 200): string[] {
  if (chunkSize <= 0 || overlap < 0 || overlap >= chunkSize) {
    throw new Error("Invalid chunk configuration");
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < content.length) {
    const end = Math.min(start + chunkSize, content.length);
    chunks.push(content.slice(start, end));

    if (end === content.length) {
      break;
    }

    start = end - overlap;
  }

  return chunks;
}

export function parseMarkdownDocument(markdown: string): ParsedMarkdownDocument {
  const parsed = matter(markdown);
  const content = parsed.content;

  return {
    content,
    metadata: parsed.data,
    links: extractWikiLinks(content),
    chunks: chunkMarkdown(content)
  };
}
