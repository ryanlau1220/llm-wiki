import crypto from "node:crypto";

import type { LLMResponse } from "@llm-wiki/ai";
import {
  DEFAULT_CONTEXT_CHARACTER_BUDGET,
  AI_TRACE_OPERATION,
  AI_TRACE_POLICY,
  AI_TRACE_SPAN_TYPE,
  AI_TRACE_STATUS,
  completeAiTrace,
  completeAiTraceSpan,
  packRetrievalContext,
  startAiTrace,
  startAiTraceSpan,
  createLogger,
  hybridRetrieve,
  type ContextChunk,
  type ContextPack,
  type ContextPackOptions,
  type RetrievalChunk,
} from "@llm-wiki/core";
import { createDbClient } from "@llm-wiki/db";
import { synthesisModelResponseSchema } from "@llm-wiki/types";

import type { AppConfig } from "./config";
import {
  createConfiguredEmbeddingProvider,
  createConfiguredLlmProvider,
  resolveConfiguredLlmModelName,
} from "./providers";
import { createInvalidModelResponse, parseStructuredModelResponse } from "./model-response";
import { modelUsageAttributes } from "./trace-usage";

const DEFAULT_SELECTED_NOTE_SEGMENT_CHARACTER_LIMIT = 2_000;
const SELECTED_NOTE_CHUNKS_PER_DOCUMENT = 2;
const CONTEXT_BLOCK_SEPARATOR = "\n\n";

export type SelectedSynthesisSource = {
  id: string;
  title: string;
  path: string;
  content: string;
};

type SelectedNoteContextChunk = ContextChunk & {
  segmentCount: number;
};

export type SelectedNoteContextPack = ContextPack<SelectedNoteContextChunk> & {
  sourceManifest: string;
};

export type SelectedNoteContextOptions = ContextPackOptions & {
  segmentCharacterLimit?: number;
};

export async function synthesisPreview(
  config: AppConfig,
  topic: string,
  topK?: number,
  noteIds?: string[],
) {
  const logger = createLogger("synthesis");
  logger.info("New synthesis request", { topic, topK, noteIdsCount: noteIds?.length });

  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const { db } = createDbClient(config.databaseUrl);
  const traceStartedAt = Date.now();
  const selectedNoteMode = Boolean(noteIds?.length);
  let traceId: string | null = null;
  let requestSpanId: string | null = null;
  try {
    traceId = await startAiTrace(db, {
      operation: AI_TRACE_OPERATION.SYNTHESIS,
      query: topic,
      policy: selectedNoteMode ? AI_TRACE_POLICY.SELECTED_NOTES : AI_TRACE_POLICY.VAULT_HYBRID,
      policyReason: selectedNoteMode ? "explicit_note_selection" : "topic_hybrid_retrieval",
      modelProvider: config.llmProvider,
      modelName: resolveConfiguredLlmModelName(config),
      promptVersion: "synthesis-v1",
    });
    requestSpanId = await startAiTraceSpan(db, traceId, {
      spanType: AI_TRACE_SPAN_TYPE.REQUEST,
      attributes: { input_length: topic.length, selected_notes: selectedNoteMode },
    });
  } catch (error) {
    logger.error("Failed to start synthesis trace", error);
  }
  const { inArray } = await import("drizzle-orm");
  const { documents } = await import("@llm-wiki/db");

  let contextText = "";
  let sources: Array<{ id: string; title: string; path: string }> = [];
  let retrievalInfo = { chunkCount: 0, linkCount: 0 };

  if (noteIds && noteIds.length > 0) {
    const retrievalStartedAt = Date.now();
    const retrievalSpanId = traceId
      ? await startAiTraceSpan(db, traceId, {
          spanType: AI_TRACE_SPAN_TYPE.RETRIEVAL,
          parentSpanId: requestSpanId ?? undefined,
          attributes: { retrieval_mode: "selected_notes", requested_count: noteIds.length },
        })
      : null;
    const requestedNoteIds = [...new Set(noteIds)];
    const selectedNotes = await db
      .select({
        id: documents.id,
        title: documents.title,
        path: documents.path,
        content: documents.content,
      })
      .from(documents)
      .where(inArray(documents.id, requestedNoteIds));

    const selectedSources = orderSelectedSynthesisSources(
      selectedNotes.map((note) => ({
        id: note.id,
        title: note.title ?? "",
        path: note.path,
        content: note.content,
      })),
      requestedNoteIds,
    );
    const contextPack = packSelectedNoteSynthesisContext(selectedSources);

    sources = selectedSources.map(({ content: _content, ...source }) => source);
    contextText = contextPack.text;
    retrievalInfo = { chunkCount: selectedNotes.length, linkCount: 0 };
    if (retrievalSpanId)
      await completeAiTraceSpan(db, retrievalSpanId, {
        status: AI_TRACE_STATUS.SUCCEEDED,
        durationMs: Date.now() - retrievalStartedAt,
        attributes: { selected_count: selectedNotes.length },
      });
  } else {
    const retrievalStartedAt = Date.now();
    const retrievalSpanId = traceId
      ? await startAiTraceSpan(db, traceId, {
          spanType: AI_TRACE_SPAN_TYPE.RETRIEVAL,
          parentSpanId: requestSpanId ?? undefined,
          attributes: { retrieval_mode: "hybrid", top_k: topK ?? 10 },
        })
      : null;
    const embeddingProvider = createConfiguredEmbeddingProvider(config);

    const retrievalResults = await hybridRetrieve(
      { db, embeddingProvider },
      { query: topic, topK },
    );

    const contextPack = packRetrievedSynthesisContext(retrievalResults.chunks);
    contextText = contextPack.text;
    retrievalInfo = {
      chunkCount: retrievalResults.chunks.length,
      linkCount: retrievalResults.links.length,
    };
    if (retrievalSpanId)
      await completeAiTraceSpan(db, retrievalSpanId, {
        status: AI_TRACE_STATUS.SUCCEEDED,
        durationMs: Date.now() - retrievalStartedAt,
        attributes: {
          candidate_count: retrievalResults.chunks.length,
          link_count: retrievalResults.links.length,
        },
      });

    const documentIds = [...new Set(contextPack.chunks.map((chunk) => chunk.documentId))];
    if (documentIds.length > 0) {
      sources = await db
        .select({ id: documents.id, title: documents.title, path: documents.path })
        .from(documents)
        .where(inArray(documents.id, documentIds))
        .then((rows) => rows.map((r) => ({ id: r.id, title: r.title ?? "", path: r.path })));
    }
  }

  const llmProvider = createConfiguredLlmProvider(config);

  const systemInstruction = `
You are an expert knowledge synthesizer for "LLM Wiki".
Your job is to synthesize a wiki-style note from the provided sources.

RULES:
1. Use ONLY the provided sources. If sources are insufficient, say so in the content.
2. Produce a clean, structured markdown note.
3. Suggest related concepts in the "links" JSON field (labels only, no brackets).
4. Output valid JSON matching the schema below.
5. IMPORTANT: NEVER use unescaped double quotes inside the "content" or "title" string values. If you need to emphasize something or use a quote within the text, use single quotes (') or markdown bolding (**text**) instead. Unescaped double quotes will break the JSON parsing and fail the task.
6. CRITICAL WIKILINK FORMAT: Always format internal links to other concepts as Obsidian-style wikilinks [[Concept Name]] (e.g., [[Machine Learning]]) directly inside the markdown content text, especially when discussing related concepts.

JSON SCHEMA:
{
  "note": {
    "title": "string",
    "content": "string (markdown)",
    "links": ["string"],
    "tags": ["string"]
  }
}
`.trim();

  const prompt = `
TOPIC: ${topic}

SOURCES:
${contextText || "No sources found."}

Synthesize a concise wiki note.
`.trim();

  logger.debug("Generating synthesis...");
  const modelStartedAt = Date.now();
  const modelSpanId = traceId
    ? await startAiTraceSpan(db, traceId, {
        spanType: AI_TRACE_SPAN_TYPE.MODEL,
        parentSpanId: requestSpanId ?? undefined,
        attributes: { provider: config.llmProvider, response_format: "json" },
      })
    : null;
  let llmResponse: LLMResponse;
  try {
    llmResponse = await llmProvider.generate({
      prompt,
      systemInstruction,
      responseMimeType: "application/json",
      temperature: 0.2,
    });
  } catch (error) {
    if (modelSpanId)
      await completeAiTraceSpan(db, modelSpanId, {
        status: AI_TRACE_STATUS.FAILED,
        durationMs: Date.now() - modelStartedAt,
        errorCode: "generation_failed",
      });
    await completeSynthesisTrace(db, traceId, requestSpanId, {
      status: AI_TRACE_STATUS.FAILED,
      candidateCount: retrievalInfo.chunkCount,
      selectedEvidenceCount: retrievalInfo.chunkCount,
      contextCharacterCount: contextText.length,
      durationMs: Date.now() - traceStartedAt,
      errorCode: "generation_failed",
    });
    throw error;
  }
  if (modelSpanId)
    await completeAiTraceSpan(db, modelSpanId, {
      status: AI_TRACE_STATUS.SUCCEEDED,
      durationMs: Date.now() - modelStartedAt,
      attributes: { provider: config.llmProvider, ...modelUsageAttributes(llmResponse.usage) },
    });

  const parsed = parseStructuredModelResponse(llmResponse.text, synthesisModelResponseSchema);
  if (parsed.success) {
    const requestId = traceId ?? crypto.randomUUID();
    await completeSynthesisTrace(db, traceId, requestSpanId, {
      status: AI_TRACE_STATUS.SUCCEEDED,
      candidateCount: retrievalInfo.chunkCount,
      selectedEvidenceCount: retrievalInfo.chunkCount,
      contextCharacterCount: contextText.length,
      durationMs: Date.now() - traceStartedAt,
    });
    return {
      requestId,
      traceId,
      note: parsed.data.note,
      sources,
      retrieval: retrievalInfo,
    };
  }

  logger.error("Failed to validate synthesis response", new Error(parsed.reason), {
    responseLength: llmResponse.text.length,
    reason: parsed.reason,
  });

  await completeSynthesisTrace(db, traceId, requestSpanId, {
    status: AI_TRACE_STATUS.FAILED,
    candidateCount: retrievalInfo.chunkCount,
    selectedEvidenceCount: retrievalInfo.chunkCount,
    contextCharacterCount: contextText.length,
    durationMs: Date.now() - traceStartedAt,
    errorCode: "invalid_model_response",
  });
  return { ...createInvalidModelResponse(), traceId };
}

async function completeSynthesisTrace(
  db: ReturnType<typeof createDbClient>["db"],
  traceId: string | null,
  requestSpanId: string | null,
  input: Parameters<typeof completeAiTrace>[2],
) {
  if (!traceId) return;
  await completeAiTrace(db, traceId, input);
  if (requestSpanId)
    await completeAiTraceSpan(db, requestSpanId, {
      status: input.status,
      durationMs: input.durationMs,
      errorCode: input.errorCode,
      attributes: { source_count: input.selectedEvidenceCount },
    });
}

export function packRetrievedSynthesisContext(
  chunks: RetrievalChunk[],
  options: ContextPackOptions = {},
): ContextPack<RetrievalChunk> {
  return packRetrievalContext(chunks, options);
}

export function orderSelectedSynthesisSources(
  sources: SelectedSynthesisSource[],
  requestedNoteIds: string[],
): SelectedSynthesisSource[] {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  return requestedNoteIds.flatMap((noteId) => {
    const source = sourceById.get(noteId);
    return source ? [source] : [];
  });
}

export function packSelectedNoteSynthesisContext(
  sources: SelectedSynthesisSource[],
  options: SelectedNoteContextOptions = {},
): SelectedNoteContextPack {
  const characterBudget = options.characterBudget ?? DEFAULT_CONTEXT_CHARACTER_BUDGET;
  const chunksPerDocument = options.chunksPerDocument ?? SELECTED_NOTE_CHUNKS_PER_DOCUMENT;
  const segmentCharacterLimit =
    options.segmentCharacterLimit ?? DEFAULT_SELECTED_NOTE_SEGMENT_CHARACTER_LIMIT;
  validateSelectedNoteContextOptions(characterBudget, segmentCharacterLimit);

  if (sources.length === 0) {
    return { chunks: [], text: "", characterCount: 0, sourceManifest: "" };
  }

  const chunks = sources.flatMap((source) =>
    createSelectedNoteContextChunks(source, segmentCharacterLimit),
  );
  const sourceManifest = formatSelectedSourceManifest(sources, chunks);
  if (sourceManifest.length > characterBudget) {
    throw new Error("Synthesis context budget is too small to label every selected source");
  }

  const contentBudget = characterBudget - sourceManifest.length - CONTEXT_BLOCK_SEPARATOR.length;

  const contextPack =
    contentBudget <= 0
      ? { chunks: [], text: "", characterCount: 0 }
      : packRetrievalContext(chunks, {
          characterBudget: contentBudget,
          chunksPerDocument,
        });
  const text = contextPack.text
    ? `${contextPack.text}${CONTEXT_BLOCK_SEPARATOR}${sourceManifest}`
    : sourceManifest;

  return {
    chunks: contextPack.chunks,
    text,
    characterCount: text.length,
    sourceManifest,
  };
}

function createSelectedNoteContextChunks(
  source: SelectedSynthesisSource,
  segmentCharacterLimit: number,
): SelectedNoteContextChunk[] {
  const segments = splitSelectedNoteContent(source.content, segmentCharacterLimit);

  return segments.map((segment, index) => ({
    documentId: source.id,
    documentPath: source.path,
    chunkIndex: index,
    segmentCount: segments.length,
    text: `[Selected note ${source.title || source.path}; segment ${index + 1} of ${segments.length}]\n${segment}`,
  }));
}

function splitSelectedNoteContent(content: string, segmentCharacterLimit: number): string[] {
  if (!content) return ["(empty note)"];

  const segments: string[] = [];
  for (let offset = 0; offset < content.length; offset += segmentCharacterLimit) {
    segments.push(content.slice(offset, offset + segmentCharacterLimit));
  }
  return segments;
}

function formatSelectedSourceManifest(
  sources: SelectedSynthesisSource[],
  chunks: SelectedNoteContextChunk[],
): string {
  const segmentCountByDocumentId = new Map<string, number>();
  for (const chunk of chunks) {
    segmentCountByDocumentId.set(chunk.documentId, chunk.segmentCount);
  }

  const entries = sources.map((source) => {
    const segmentCount = segmentCountByDocumentId.get(source.id) ?? 0;
    return `${source.path} (${segmentCount} segment${segmentCount === 1 ? "" : "s"})`;
  });

  return `[Selected-source manifest: use only the labelled context segments. A selected source may be incomplete when not every labelled segment appears above. ${entries.join("; ")}]`;
}

function validateSelectedNoteContextOptions(
  characterBudget: number,
  segmentCharacterLimit: number,
): void {
  if (!Number.isInteger(characterBudget) || characterBudget < 1) {
    throw new Error("Synthesis context character budget must be a positive integer");
  }
  if (!Number.isInteger(segmentCharacterLimit) || segmentCharacterLimit < 1) {
    throw new Error("Selected note segment character limit must be a positive integer");
  }
}
