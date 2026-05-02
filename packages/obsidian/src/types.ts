import type { QualityMetrics } from "@llm-wiki/types";

export type ParsedMarkdownDocument = {
  content: string;
  metadata: Record<string, unknown>;
  links: string[];
  chunks: string[];
  qualityMetrics?: QualityMetrics;
};

export type WatchEvent = {
  path: string;
  event: "add" | "change" | "unlink";
  at: number;
};

export type WatcherConfig = {
  rootPath: string;
  debounceMs: number;
  ignoredGlobs?: string[];
  onEvent: (event: WatchEvent) => Promise<void>;
};
