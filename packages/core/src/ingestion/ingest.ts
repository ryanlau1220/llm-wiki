import type { EmbeddingResult } from "@llm-wiki/ai";
import {
  chunks,
  type DbClient,
  documents,
  EMBEDDING_DIMENSIONS,
  ingestionRuns,
  links,
} from "@llm-wiki/db";
import { chunkMarkdownWithOffsets, parseMarkdownDocument } from "@llm-wiki/obsidian";
import { eq } from "drizzle-orm";
import { calculateCoherence } from "../intelligence/coherence";
import { createLogger } from "../logging";
import type { IngestionDependencies, IngestionInput, IngestionResult } from "./types";
import {
  byteLength,
  calculateAggregateScore,
  hashContent,
  inferTitleFromPath,
  normalizeMarkdownContent,
} from "./utils";

const DEFAULT_DOCUMENT_TYPE = "note";
const LOW_QUALITY_THRESHOLD = 0.6;

export async function deleteDocumentByPath(
  deps: IngestionDependencies,
  vaultPath: string,
): Promise<{ deleted: boolean }> {
  const existing = await deps.db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.path, vaultPath))
    .limit(1);

  if (!existing.length) {
    return { deleted: false };
  }

  await deps.db.transaction(async (tx: DbClient) => {
    // Reset any links pointing to this document to unresolved status
    await tx
      .update(links)
      .set({
        target_document_id: null,
        is_resolved: false,
        updated_at: new Date(),
      })
      .where(eq(links.target_document_id, existing[0].id));

    await tx.delete(links).where(eq(links.source_document_id, existing[0].id));
    await tx.delete(chunks).where(eq(chunks.document_id, existing[0].id));
    await tx.delete(documents).where(eq(documents.id, existing[0].id));
  });

  return { deleted: true };
}

export async function ingestMarkdown(
  deps: IngestionDependencies,
  input: IngestionInput,
): Promise<IngestionResult> {
  const startTime = Date.now();
  const now = deps.options.now ?? (() => new Date());

  const normalized = normalizeMarkdownContent(input.rawContent);
  const contentHash = hashContent(normalized);
  const fileSizeBytes = byteLength(input.rawContent);
  const logger = createLogger("ingestion");

  try {
    const existing = await deps.db
      .select()
      .from(documents)
      .where(eq(documents.path, input.vaultPath))
      .limit(1);

    if (existing.length && existing[0].content_hash === contentHash) {
      return recordSkippedIngestion(
        deps,
        input.vaultPath,
        fileSizeBytes,
        contentHash,
        startTime,
        now,
        existing[0],
      );
    }

    const prepared = await prepareDocumentForIngestion(deps, input, normalized, logger);

    const result = await deps.db.transaction(async (tx: DbClient) => {
      const existing = await tx
        .select()
        .from(documents)
        .where(eq(documents.path, input.vaultPath))
        .limit(1);

      if (existing.length && existing[0].content_hash === contentHash) {
        await tx.insert(ingestionRuns).values({
          document_path: input.vaultPath,
          file_size_bytes: fileSizeBytes,
          content_hash: contentHash,
          status: "skipped",
          duration_ms: Date.now() - startTime,
          created_at: now(),
        });

        return {
          status: "skipped" as const,
          documentId: existing[0].id,
          version: existing[0].version,
        };
      }

      const baseValues = {
        path: input.vaultPath,
        title: prepared.title,
        type: prepared.type,
        content: prepared.content,
        content_hash: contentHash,
        source_kind: input.sourceKind,
        is_ai_generated: input.isAiGenerated,
        quality_score: prepared.qualityScore,
        quality_metrics: prepared.qualityMetrics,
        ai_status: prepared.aiStatus,
        health_score: prepared.healthScore,
        updated_at: now(),
      };

      let documentId = existing[0]?.id;
      let nextVersion = existing[0]?.version ?? 0;
      let status: "created" | "updated" = "created";

      if (!existing.length) {
        const inserted = await tx
          .insert(documents)
          .values({
            ...baseValues,
            version: 1,
            created_at: now(),
          })
          .returning({ id: documents.id, version: documents.version });

        documentId = inserted[0].id;
        nextVersion = inserted[0].version;
        status = "created";
      } else {
        nextVersion = (existing[0].version ?? 0) + 1;
        status = "updated";

        await tx
          .update(documents)
          .set({
            ...baseValues,
            version: nextVersion,
          })
          .where(eq(documents.id, existing[0].id));

        await tx.delete(chunks).where(eq(chunks.document_id, existing[0].id));
        await tx.delete(links).where(eq(links.source_document_id, existing[0].id));
      }

      if (!documentId) {
        throw new Error("Document id missing after upsert");
      }

      const chunksWithOffsets = chunkMarkdownWithOffsets(prepared.content);
      const chunkTexts = chunksWithOffsets.map((chunk) => chunk.text);
      const embeddings = await deps.options.embeddingProvider.embed({
        texts: chunkTexts,
      });
      const dimensions = embeddings.vectors[0]?.length ?? 0;
      if (dimensions !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Embedding dimension mismatch: got ${dimensions}, expected ${EMBEDDING_DIMENSIONS}. ` +
            `Check embedding model/config and reindex after changing models.`,
        );
      }
      const chunkRows = buildChunkRows(documentId, chunksWithOffsets, embeddings, deps.options);
      if (chunkRows.length) {
        await tx.insert(chunks).values(chunkRows);
      }

      const linkRows = prepared.links.map((target) => ({
        source_document_id: documentId,
        source_path: input.vaultPath,
        target_label: target,
        is_resolved: false,
        created_at: now(),
        updated_at: now(),
      }));

      if (linkRows.length) {
        await tx.insert(links).values(linkRows);
      }

      // Resolve links dynamically for this document
      const { resolveLinksForDocument } = await import("../linking/resolver");
      await resolveLinksForDocument(tx, documentId, prepared.title);

      await tx.insert(ingestionRuns).values({
        document_path: input.vaultPath,
        file_size_bytes: fileSizeBytes,
        content_hash: contentHash,
        status,
        duration_ms: Date.now() - startTime,
        created_at: now(),
      });

      return {
        status,
        documentId,
        version: nextVersion,
      };
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    await deps.db.insert(ingestionRuns).values({
      document_path: input.vaultPath,
      file_size_bytes: fileSizeBytes,
      content_hash: contentHash,
      status: "failed",
      error_message: message,
      duration_ms: Date.now() - startTime,
      created_at: now(),
    });

    return {
      status: "failed",
      error: message,
    };
  }
}

async function recordSkippedIngestion(
  deps: IngestionDependencies,
  vaultPath: string,
  fileSizeBytes: number,
  contentHash: string,
  startTime: number,
  now: () => Date,
  document: { id: string; version: number },
): Promise<IngestionResult> {
  await deps.db.transaction(async (tx: DbClient) => {
    await tx.insert(ingestionRuns).values({
      document_path: vaultPath,
      file_size_bytes: fileSizeBytes,
      content_hash: contentHash,
      status: "skipped",
      duration_ms: Date.now() - startTime,
      created_at: now(),
    });
  });

  return {
    status: "skipped",
    documentId: document.id,
    version: document.version,
  };
}

async function prepareDocumentForIngestion(
  deps: IngestionDependencies,
  input: IngestionInput,
  normalized: string,
  logger: ReturnType<typeof createLogger>,
) {
  const parsed = parseMarkdownDocument(normalized);
  const coherence = await calculateCoherence(deps.options.llmProvider, parsed.content).catch(
    (error: unknown) => {
      logger.warn("Coherence scoring unavailable; persisting deterministic quality metrics only", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return undefined;
    },
  );
  const qualityMetrics =
    parsed.qualityMetrics && coherence !== undefined
      ? { ...parsed.qualityMetrics, coherence }
      : parsed.qualityMetrics;
  const qualityScore = qualityMetrics ? calculateAggregateScore(qualityMetrics) : null;
  const parsedHealth = parseHealthScore(parsed.metadata.health_score);

  return {
    title: inferTitleFromPath(input.vaultPath),
    type: (parsed.metadata.type as string) || DEFAULT_DOCUMENT_TYPE,
    content: parsed.content,
    links: parsed.links,
    qualityMetrics,
    qualityScore,
    aiStatus:
      (parsed.metadata.ai_status as string) ||
      (qualityScore !== null && qualityScore < LOW_QUALITY_THRESHOLD ? "messy" : "clean"),
    healthScore: parsedHealth ?? qualityScore,
  };
}

function parseHealthScore(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  return Number.isNaN(parsed) ? null : parsed;
}

function buildChunkRows(
  documentId: string,
  chunksWithOffsets: ReturnType<typeof chunkMarkdownWithOffsets>,
  embeddings: EmbeddingResult,
  options: IngestionDependencies["options"],
) {
  const now = options.now ? options.now() : new Date();

  return chunksWithOffsets.map((chunk, index) => ({
    document_id: documentId,
    chunk_index: index,
    text: chunk.text,
    embedding: embeddings.vectors[index] ?? [],
    embedding_model: embeddings.model.model,
    embedding_version: options.embeddingVersion,
    source_start_offset: chunk.start,
    source_end_offset: chunk.end,
    token_count: null,
    created_at: now,
    updated_at: now,
  }));
}
