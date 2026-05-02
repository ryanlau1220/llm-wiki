import matter from "gray-matter";
import type { QualityMetrics } from "@llm-wiki/types";
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

export type ChunkWithOffsets = {
  text: string;
  start: number;
  end: number;
};

export function chunkMarkdownWithOffsets(
  content: string,
  chunkSize = 1000,
  overlap = 200
): ChunkWithOffsets[] {
  if (chunkSize <= 0 || overlap < 0 || overlap >= chunkSize) {
    throw new Error("Invalid chunk configuration");
  }

  const chunks: ChunkWithOffsets[] = [];
  let start = 0;

  while (start < content.length) {
    const end = Math.min(start + chunkSize, content.length);
    chunks.push({
      text: content.slice(start, end),
      start,
      end
    });

    if (end === content.length) {
      break;
    }

    start = end - overlap;
  }

  return chunks;
}

export function calculateInitialQualityMetrics(
  content: string,
  metadata: Record<string, unknown>,
  links: string[]
): QualityMetrics {
  const wordCount = content.trim().split(/\s+/).length;
  
  // Link density: proportional to content length, capped at 1.0
  // Goal: 1 link per 200 words = 0.5 score
  const linkDensity = Math.min(1.0, (links.length * 400) / Math.max(1, wordCount));

  // Completeness: presence of basic metadata (title, tags)
  let completeness = 0;
  if (metadata.title) completeness += 0.5;
  if (metadata.tags && Array.isArray(metadata.tags) && metadata.tags.length > 0) completeness += 0.5;

  return {
    linkDensity,
    completeness,
    wordCount,
  };
}

export function parseMarkdownDocument(markdown: string): ParsedMarkdownDocument {
  const parsed = matter(markdown);
  const content = parsed.content;
  const links = extractWikiLinks(content);
  const metadata = parsed.data;

  const qualityMetrics = calculateInitialQualityMetrics(content, metadata, links);

  return {
    content,
    metadata,
    links,
    chunks: chunkMarkdown(content),
    qualityMetrics
  };
}
