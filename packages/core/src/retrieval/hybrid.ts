import { inArray, like } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm/sql";

import type { RetrievalDependencies, RetrievalRequest, RetrievalResponse } from "./types";
import { chunks, links } from "@llm-wiki/db";

const DEFAULT_TOP_K = 8;
const DEFAULT_VECTOR_CANDIDATES = 200;
const DEFAULT_FTS_CANDIDATES = 50;
const DEFAULT_LINK_EXPANSION = 50;

export async function hybridRetrieve(
  deps: RetrievalDependencies,
  request: RetrievalRequest
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
      text: chunks.text,
      distance: cosineDistance(chunks.embedding, queryVector)
    })
    .from(chunks)
    // pgvector cosine distance: lower is more similar
    .orderBy(cosineDistance(chunks.embedding, queryVector))
    .limit(vectorLimit);

  // Convert cosine distance to a similarity-ish score in [0, 1] for merging with FTS.
  const vectorScored = vectorCandidates
    .map((candidate) => ({
      documentId: candidate.documentId,
      text: candidate.text,
      score: Math.max(0, 1 - Number(candidate.distance ?? 1)),
      source: "vector" as const
    }))
    .slice(0, topK);

  const ftsCandidates = await deps.db
    .select({
      documentId: chunks.document_id,
      text: chunks.text
    })
    .from(chunks)
    .where(like(chunks.text, `%${query}%`))
    .limit(ftsLimit);

  const ftsScored = ftsCandidates.map((candidate) => ({
    documentId: candidate.documentId,
    text: candidate.text,
    score: 0.2,
    source: "fts" as const
  }));

  const merged = mergeResults(vectorScored, ftsScored, topK);

  const documentIds = [...new Set(merged.map((item) => item.documentId))];
  if (!documentIds.length) {
    return { chunks: merged, links: [] };
  }

  const linkRows = await deps.db
    .select({
      sourceDocumentId: links.source_document_id,
      targetLabel: links.target_label,
      targetDocumentId: links.target_document_id
    })
    .from(links)
    .where(inArray(links.source_document_id, documentIds))
    .limit(linkLimit);

  return { chunks: merged, links: linkRows };
}

function mergeResults(
  vectorResults: Array<{ documentId: string; text: string; score: number; source: "vector" }>,
  ftsResults: Array<{ documentId: string; text: string; score: number; source: "fts" }>,
  topK: number
) {
  const merged = new Map<string, { documentId: string; text: string; score: number; source: "hybrid" | "vector" | "fts" }>();

  for (const result of vectorResults) {
    merged.set(result.documentId, { ...result });
  }

  for (const result of ftsResults) {
    const existing = merged.get(result.documentId);
    if (existing) {
      merged.set(result.documentId, {
        documentId: existing.documentId,
        text: existing.text,
        score: Math.max(existing.score, result.score) + 0.05,
        source: "hybrid"
      });
    } else {
      merged.set(result.documentId, { ...result });
    }
  }

  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}
