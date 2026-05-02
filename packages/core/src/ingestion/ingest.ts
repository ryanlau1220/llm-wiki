import { eq } from "drizzle-orm";

import type { EmbeddingResult } from "@llm-wiki/ai";
import { chunkMarkdownWithOffsets, parseMarkdownDocument } from "@llm-wiki/obsidian";
import {
  chunks,
  documents,
  ingestionRuns,
  links,
  type DbClient
} from "@llm-wiki/db";

import type { IngestionDependencies, IngestionInput, IngestionResult } from "./types";
import { 
  byteLength, 
  calculateAggregateScore, 
  hashContent, 
  inferTitleFromPath, 
  normalizeMarkdownContent 
} from "./utils";
import { calculateCoherence } from "../intelligence/coherence";

const DEFAULT_DOCUMENT_TYPE = "note";

export async function deleteDocumentByPath(
  deps: IngestionDependencies,
  vaultPath: string
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
    await tx.delete(links).where(eq(links.source_document_id, existing[0].id));
    await tx.delete(chunks).where(eq(chunks.document_id, existing[0].id));
    await tx.delete(documents).where(eq(documents.id, existing[0].id));
  });

  return { deleted: true };
}

export async function ingestMarkdown(
  deps: IngestionDependencies,
  input: IngestionInput
): Promise<IngestionResult> {
  const startTime = Date.now();
  const now = deps.options.now ?? (() => new Date());

  const normalized = normalizeMarkdownContent(input.rawContent);
  const contentHash = hashContent(normalized);
  const fileSizeBytes = byteLength(input.rawContent);

  try {
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
          created_at: now()
        });

        return {
          status: "skipped" as const,
          documentId: existing[0].id,
          version: existing[0].version
        };
      }

      const parsed = parseMarkdownDocument(normalized);
      const title = inferTitleFromPath(input.vaultPath);
      
      // Calculate AI-based coherence score
      const coherence = await calculateCoherence(deps.options.llmProvider, parsed.content);
      if (parsed.qualityMetrics) {
        parsed.qualityMetrics.coherence = coherence;
      }

      const qualityScore = parsed.qualityMetrics 
        ? calculateAggregateScore(parsed.qualityMetrics)
        : null;

      const baseValues = {
        path: input.vaultPath,
        title,
        type: DEFAULT_DOCUMENT_TYPE,
        content: parsed.content,
        content_hash: contentHash,
        source_kind: input.sourceKind,
        is_ai_generated: input.isAiGenerated,
        quality_score: qualityScore,
        quality_metrics: parsed.qualityMetrics,
        updated_at: now()
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
            created_at: now()
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
            version: nextVersion
          })
          .where(eq(documents.id, existing[0].id));

        await tx.delete(chunks).where(eq(chunks.document_id, existing[0].id));
        await tx.delete(links).where(eq(links.source_document_id, existing[0].id));
      }

      if (!documentId) {
        throw new Error("Document id missing after upsert");
      }

      const chunksWithOffsets = chunkMarkdownWithOffsets(parsed.content);
      const chunkTexts = chunksWithOffsets.map((chunk) => chunk.text);
      const embeddings = await deps.options.embeddingProvider.embed({
        texts: chunkTexts
      });
      const chunkRows = buildChunkRows(documentId, chunksWithOffsets, embeddings, deps.options);
      if (chunkRows.length) {
        await tx.insert(chunks).values(chunkRows);
      }

      const linkRows = parsed.links.map((target) => ({
        source_document_id: documentId,
        source_path: input.vaultPath,
        target_label: target,
        is_resolved: false,
        created_at: now(),
        updated_at: now()
      }));

      if (linkRows.length) {
        await tx.insert(links).values(linkRows);
      }

      await tx.insert(ingestionRuns).values({
        document_path: input.vaultPath,
        file_size_bytes: fileSizeBytes,
        content_hash: contentHash,
        status,
        duration_ms: Date.now() - startTime,
        created_at: now()
      });

      return {
        status,
        documentId,
        version: nextVersion
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
      created_at: now()
    });

    return {
      status: "failed",
      error: message
    };
  }
}

function buildChunkRows(
  documentId: string,
  chunksWithOffsets: ReturnType<typeof chunkMarkdownWithOffsets>,
  embeddings: EmbeddingResult,
  options: IngestionDependencies["options"]
) {
  const now = options.now ? options.now() : new Date();

  return chunksWithOffsets.map((chunk, index) => ({
    document_id: documentId,
    chunk_index: index,
    text: chunk.text,
    embedding: JSON.stringify(embeddings.vectors[index] ?? []),
    embedding_model: embeddings.model.model,
    embedding_version: options.embeddingVersion,
    source_start_offset: chunk.start,
    source_end_offset: chunk.end,
    token_count: null,
    created_at: now,
    updated_at: now
  }));
}
