import { chunks, documents, links } from "@llm-wiki/db";
import { and, asc, desc, eq, inArray, like, sql } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm/sql";
import { rerankRetrievalChunks } from "./rerank";
import type {
  RetrievalChunk,
  RetrievalDependencies,
  RetrievalRequest,
  RetrievalResponse,
} from "./types";

const DEFAULT_TOP_K = 8;
const DEFAULT_VECTOR_CANDIDATES = 200;
const DEFAULT_FTS_CANDIDATES = 50;
const DEFAULT_LINK_EXPANSION = 50;
const FTS_CONFIGURATION = "simple";
const RRF_RANK_OFFSET = 60;
const MAX_RERANK_CANDIDATES = 50;
const DEFAULT_MAX_CHUNKS_PER_DOCUMENT = 2;
const NEAR_DUPLICATE_SIMILARITY = 0.9;
const MIN_NEAR_DUPLICATE_TERMS = 6;
const MAX_FILTERED_DOCUMENT_IDS = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type NormalizedRetrievalMetadataFilters = {
  documentIds?: string[];
  pathPrefix?: string;
};

type RetrievalDiversityOptions = {
  maxChunksPerDocument?: number;
  nearDuplicateSimilarity?: number;
};

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
  const filters = normalizeRetrievalMetadataFilters(request.filters);
  const metadataFilter = buildMetadataFilter(filters);

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
    .where(metadataFilter)
    // pgvector cosine distance: lower is more similar
    .orderBy(
      cosineDistance(chunks.embedding, queryVector),
      asc(documents.path),
      asc(chunks.chunk_index),
    )
    .limit(vectorLimit);

  // Convert cosine distance to a similarity-ish score in [0, 1] for merging with FTS.
  const vectorScored = vectorCandidates.map((candidate) => ({
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
    .where(and(metadataFilter, sql`${chunks.search_vector} @@ ${lexicalQuery}`))
    .orderBy(desc(lexicalRank), asc(documents.path), asc(chunks.chunk_index))
    .limit(ftsLimit);

  const ftsScored = ftsCandidates.map((candidate) => ({
    documentId: candidate.documentId,
    documentPath: candidate.documentPath,
    chunkIndex: candidate.chunkIndex,
    text: candidate.text,
    score: Number(candidate.score),
    source: "fts" as const,
  }));

  const rerankCandidateLimit = Math.max(
    topK,
    Math.min(vectorLimit + ftsLimit, MAX_RERANK_CANDIDATES),
  );
  const merged = selectDiverseRetrievalChunks(
    rerankRetrievalChunks(query, fuseRankedResults(vectorScored, ftsScored, rerankCandidateLimit)),
    topK,
  );

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

  return [...merged.values()].sort(compareRetrievalChunks).slice(0, topK);
}

function addRankedResults(
  merged: Map<
    string,
    {
      documentId: string;
      documentPath: string;
      chunkIndex: number;
      text: string;
      score: number;
      source: "hybrid" | "vector" | "fts";
    }
  >,
  results: Array<{
    documentId: string;
    documentPath: string;
    chunkIndex: number;
    text: string;
    score: number;
    source: "vector" | "fts";
  }>,
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

export function normalizeRetrievalMetadataFilters(
  filters?: unknown,
): NormalizedRetrievalMetadataFilters | undefined {
  if (filters === undefined) return undefined;
  if (!isRecord(filters)) {
    throw new TypeError("filters must be an object");
  }

  const documentIds = normalizeDocumentIds(filters.documentIds);
  const pathPrefix = normalizePathPrefix(filters.pathPrefix);

  if (!documentIds?.length && !pathPrefix) return undefined;

  return {
    ...(documentIds?.length ? { documentIds } : {}),
    ...(pathPrefix ? { pathPrefix } : {}),
  };
}

export function selectDiverseRetrievalChunks(
  chunks: RetrievalChunk[],
  topK: number,
  options: RetrievalDiversityOptions = {},
): RetrievalChunk[] {
  const maxChunksPerDocument = options.maxChunksPerDocument ?? DEFAULT_MAX_CHUNKS_PER_DOCUMENT;
  const nearDuplicateSimilarity = options.nearDuplicateSimilarity ?? NEAR_DUPLICATE_SIMILARITY;

  if (!Number.isInteger(topK) || topK < 1) {
    throw new RangeError("topK must be a positive integer");
  }
  if (!Number.isInteger(maxChunksPerDocument) || maxChunksPerDocument < 1) {
    throw new RangeError("maxChunksPerDocument must be a positive integer");
  }
  if (nearDuplicateSimilarity <= 0 || nearDuplicateSimilarity > 1) {
    throw new RangeError("nearDuplicateSimilarity must be greater than 0 and at most 1");
  }

  const documentCounts = new Map<string, number>();
  const selected: RetrievalChunk[] = [];
  const selectedTermSets: Set<string>[] = [];

  for (const chunk of chunks) {
    if ((documentCounts.get(chunk.documentId) ?? 0) >= maxChunksPerDocument) continue;

    const terms = tokenSet(chunk.text);
    if (
      selectedTermSets.some((existingTerms) =>
        isNearDuplicate(terms, existingTerms, nearDuplicateSimilarity),
      )
    ) {
      continue;
    }

    selected.push(chunk);
    selectedTermSets.push(terms);
    documentCounts.set(chunk.documentId, (documentCounts.get(chunk.documentId) ?? 0) + 1);
    if (selected.length === topK) break;
  }

  return selected;
}

function buildMetadataFilter(filters: NormalizedRetrievalMetadataFilters | undefined) {
  if (!filters) return undefined;

  return and(
    filters.documentIds?.length ? inArray(documents.id, filters.documentIds) : undefined,
    filters.pathPrefix
      ? like(documents.path, `${escapeLikePattern(filters.pathPrefix)}%`)
      : undefined,
  );
}

function normalizeDocumentIds(documentIds: unknown): string[] | undefined {
  if (documentIds === undefined) return undefined;
  if (
    !Array.isArray(documentIds) ||
    documentIds.some((documentId) => typeof documentId !== "string")
  ) {
    throw new TypeError("documentIds must be an array of UUID strings");
  }
  if (!documentIds.length) {
    throw new TypeError("documentIds must not be empty when provided");
  }
  if (documentIds.length > MAX_FILTERED_DOCUMENT_IDS) {
    throw new RangeError(
      `documentIds cannot contain more than ${MAX_FILTERED_DOCUMENT_IDS} values`,
    );
  }

  const normalized = [...new Set(documentIds.map((documentId) => documentId.trim()))];
  if (normalized.some((documentId) => !UUID_PATTERN.test(documentId))) {
    throw new TypeError("documentIds must contain UUID values");
  }

  return normalized;
}

function normalizePathPrefix(pathPrefix: unknown): string | undefined {
  if (pathPrefix === undefined) return undefined;
  if (typeof pathPrefix !== "string") {
    throw new TypeError("pathPrefix must be a string");
  }

  const normalized = pathPrefix.trim().replaceAll("\\", "/").replace(/\/+$/u, "");
  if (!normalized) {
    throw new TypeError("pathPrefix must not be empty");
  }
  if (
    normalized.startsWith("/") ||
    normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new TypeError("pathPrefix must be a vault-relative path without traversal segments");
  }

  return normalized;
}

function escapeLikePattern(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareRetrievalChunks(left: RetrievalChunk, right: RetrievalChunk): number {
  if (left.score !== right.score) return right.score - left.score;
  if (left.documentPath !== right.documentPath)
    return left.documentPath < right.documentPath ? -1 : 1;
  if (left.chunkIndex !== right.chunkIndex) return left.chunkIndex - right.chunkIndex;
  return left.documentId < right.documentId ? -1 : Number(left.documentId > right.documentId);
}

function tokenSet(text: string): Set<string> {
  return new Set(text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
}

function isNearDuplicate(left: Set<string>, right: Set<string>, threshold: number): boolean {
  if (left.size < MIN_NEAR_DUPLICATE_TERMS || right.size < MIN_NEAR_DUPLICATE_TERMS) {
    return false;
  }

  let intersection = 0;
  for (const term of left) {
    if (right.has(term)) intersection += 1;
  }

  const union = left.size + right.size - intersection;
  return union > 0 && intersection / union >= threshold;
}
