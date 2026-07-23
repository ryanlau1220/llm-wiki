import { desc, eq, inArray, sql } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm/sql";

import type { RetrievalDependencies, RetrievalRequest, RetrievalResponse } from "./types";
import { chunks, documents, links } from "@llm-wiki/db";

const DEFAULT_TOP_K = 8;
const DEFAULT_VECTOR_CANDIDATES = 200;
const DEFAULT_FTS_CANDIDATES = 50;
const DEFAULT_LINK_EXPANSION = 50;
const FTS_CONFIGURATION = "simple";
const RRF_RANK_OFFSET = 60;

export async function hybridRetrieve(
  deps: RetrievalDependencies,
  request: RetrievalRequest,
): Promise<RetrievalResponse> {
  const query = request.query.trim();
  if (!query) {
    return { chunks: [], links: [] };
  }

  const topK = request.topK ?? DEFAULT_TOP_K;
  const vectorLimit = request.vectorCandidateLimit ?? DEFAULT_VECTOR_CANDIDATES;
  const ftsLimit = request.ftsCandidateLimit ?? DEFAULT_FTS_CANDIDATES;
  const linkLimit = request.linkExpansionLimit ?? DEFAULT_LINK_EXPANSION;

  const queryEmbedding = await deps.embeddingProvider.embed({ texts: [query] });
  const queryVector = queryEmbedding.vectors[0] ?? [];

  const vectorCandidates = await deps.db
    .select({
      documentId: chunks.document_id,
      documentPath: documents.path,
      chunkIndex: chunks.chunk_index,
      text: chunks.text,
      distance: cosineDistance(chunks.embedding, queryVector),
    })
    .from(chunks)
    .innerJoin(documents, eq(chunks.document_id, documents.id))
    // pgvector cosine distance: lower is more similar
    .orderBy(cosineDistance(chunks.embedding, queryVector))
    .limit(vectorLimit);

  // Convert cosine distance to a similarity-ish score in [0, 1] for merging with FTS.
  const vectorScored = vectorCandidates
    .map((candidate) => ({
      documentId: candidate.documentId,
      documentPath: candidate.documentPath,
      chunkIndex: candidate.chunkIndex,
      text: candidate.text,
      score: Math.max(0, 1 - Number(candidate.distance ?? 1)),
      source: "vector" as const,
    }));

  const lexicalQuery = sql`websearch_to_tsquery(${FTS_CONFIGURATION}, ${query})`;
  const lexicalRank = sql<number>`ts_rank_cd(${chunks.search_vector}, ${lexicalQuery})`;

  const ftsCandidates = await deps.db
    .select({
      documentId: chunks.document_id,
      documentPath: documents.path,
      chunkIndex: chunks.chunk_index,
      text: chunks.text,
      score: lexicalRank,
    })
    .from(chunks)
    .innerJoin(documents, eq(chunks.document_id, documents.id))
    .where(sql`${chunks.search_vector} @@ ${lexicalQuery}`)
    .orderBy(desc(lexicalRank))
    .limit(ftsLimit);

  const ftsScored = ftsCandidates.map((candidate) => ({
    documentId: candidate.documentId,
    documentPath: candidate.documentPath,
    chunkIndex: candidate.chunkIndex,
    text: candidate.text,
    score: Number(candidate.score),
    source: "fts" as const,
  }));

  const merged = fuseRankedResults(vectorScored, ftsScored, topK);

  const documentIds = [...new Set(merged.map((item) => item.documentId))];
  if (!documentIds.length) {
    return { chunks: merged, links: [] };
  }

  const linkRows = await deps.db
    .select({
      sourceDocumentId: links.source_document_id,
      targetLabel: links.target_label,
      targetDocumentId: links.target_document_id,
    })
    .from(links)
    .where(inArray(links.source_document_id, documentIds))
    .limit(linkLimit);

  return { chunks: merged, links: linkRows };
}

function fuseRankedResults(
  vectorResults: Array<{
    documentId: string;
    documentPath: string;
    chunkIndex: number;
    text: string;
    score: number;
    source: "vector";
  }>,
  ftsResults: Array<{
    documentId: string;
    documentPath: string;
    chunkIndex: number;
    text: string;
    score: number;
    source: "fts";
  }>,
  topK: number,
) {
  const merged = new Map<
    string,
    {
      documentId: string;
      documentPath: string;
      chunkIndex: number;
      text: string;
      score: number;
      source: "hybrid" | "vector" | "fts";
    }
  >();

  addRankedResults(merged, vectorResults, "vector");
  addRankedResults(merged, ftsResults, "fts");

  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}

function addRankedResults(
  merged: Map<string, { documentId: string; documentPath: string; chunkIndex: number; text: string; score: number; source: "hybrid" | "vector" | "fts" }>,
  results: Array<{ documentId: string; documentPath: string; chunkIndex: number; text: string; score: number; source: "vector" | "fts" }>,
  source: "vector" | "fts",
): void {
  for (const [index, result] of results.entries()) {
    const key = `${result.documentId}:${result.chunkIndex}`;
    const contribution = 1 / (RRF_RANK_OFFSET + index + 1);
    const existing = merged.get(key);
    merged.set(key, {
      ...result,
      score: (existing?.score ?? 0) + contribution,
      source: existing ? "hybrid" : source,
    });
  }
}
