import type { EmbeddingProvider } from "@llm-wiki/ai";
import type { DbClient } from "@llm-wiki/db";

export type RetrievalRequest = {
  query: string;
  topK?: number;
  vectorCandidateLimit?: number;
  ftsCandidateLimit?: number;
  linkExpansionLimit?: number;
};

export type RetrievalChunk = {
  documentId: string;
  documentPath: string;
  chunkIndex: number;
  text: string;
  score: number;
  source: "vector" | "fts" | "hybrid";
};

export type RetrievalLink = {
  sourceDocumentId: string;
  targetLabel: string;
  targetDocumentId?: string | null;
};

export type RetrievalResponse = {
  chunks: RetrievalChunk[];
  links: RetrievalLink[];
};

export type RetrievalDependencies = {
  db: DbClient;
  embeddingProvider: EmbeddingProvider;
};
