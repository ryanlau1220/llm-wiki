import type { EmbeddingProvider } from "@llm-wiki/ai";
import type { DbClient } from "@llm-wiki/db";

export type IngestionInput = {
  vaultPath: string;
  rawContent: string;
  sourceKind: "human" | "ai" | "import";
  isAiGenerated: boolean;
};

export type IngestionOptions = {
  embeddingProvider: EmbeddingProvider;
  embeddingVersion: string;
  now?: () => Date;
};

export type IngestionDependencies = {
  db: DbClient;
  options: IngestionOptions;
};

export type IngestionResult = {
  status: "created" | "updated" | "skipped" | "failed";
  documentId?: string;
  version?: number;
  error?: string;
};
