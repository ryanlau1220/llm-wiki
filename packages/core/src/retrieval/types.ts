import type { EmbeddingProvider } from "@llm-wiki/ai";
import type { DbClient } from "@llm-wiki/db";

export type RetrievalRequest = {
  query: string;
  topK?: number;
  vectorCandidateLimit?: number;
  ftsCandidateLimit?: number;
  linkExpansionLimit?: number;
  filters?: RetrievalMetadataFilters;
  diversity?: RetrievalDiversityOptions;
};

export type RetrievalMetadataFilters = {
  /** Restrict retrieval to explicit document UUIDs. */
  documentIds?: string[];
  /** Restrict retrieval to a vault-relative document path prefix. */
  pathPrefix?: string;
};

export type RetrievalDiversityOptions = {
  /** Cap retained chunks from a single document after reranking. */
  maxChunksPerDocument?: number;
  /** Suppress chunks whose token-set Jaccard similarity meets this threshold. */
  nearDuplicateSimilarity?: number;
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
