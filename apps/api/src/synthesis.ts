import crypto from "node:crypto";

import { createEmbeddingProvider, createLLMProvider } from "@llm-wiki/ai";
import {
  DEFAULT_CONTEXT_CHARACTER_BUDGET,
  packRetrievalContext,
  createLogger,
  hybridRetrieve,
  type ContextChunk,
  type ContextPack,
  type ContextPackOptions,
  type RetrievalChunk,
} from "@llm-wiki/core";
import { createDbClient } from "@llm-wiki/db";

import type { AppConfig } from "./config";

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

export async function synthesisPreview(config: AppConfig, topic: string, topK?: number, noteIds?: string[]) {
  const logger = createLogger("synthesis");
  logger.info("New synthesis request", { topic, topK, noteIdsCount: noteIds?.length });

  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const { db } = createDbClient(config.databaseUrl);
  const { inArray } = await import("drizzle-orm");
  const { documents } = await import("@llm-wiki/db");

  let contextText = "";
  let sources: Array<{ id: string; title: string; path: string }> = [];
  let retrievalInfo = { chunkCount: 0, linkCount: 0 };

  if (noteIds && noteIds.length > 0) {
    const requestedNoteIds = [...new Set(noteIds)];
    const selectedNotes = await db
      .select({ id: documents.id, title: documents.title, path: documents.path, content: documents.content })
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
  } else {
    const embeddingProvider = createEmbeddingProvider({
      provider: config.embeddingProvider,
      geminiGeap: {
        projectId: config.gcpProjectId,
        location: config.gcpLocation,
        model: config.gcpEmbeddingModel
      },
      openai: {
        apiKey: config.openaiApiKey,
        baseUrl: config.openaiBaseUrl,
        model: config.openaiEmbeddingModel
      }
    });

    const retrievalResults = await hybridRetrieve(
      { db, embeddingProvider },
      { query: topic, topK }
    );

    const contextPack = packRetrievedSynthesisContext(retrievalResults.chunks);
    contextText = contextPack.text;
    retrievalInfo = {
      chunkCount: retrievalResults.chunks.length,
      linkCount: retrievalResults.links.length
    };

    const documentIds = [...new Set(contextPack.chunks.map((chunk) => chunk.documentId))];
    if (documentIds.length > 0) {
      sources = await db
        .select({ id: documents.id, title: documents.title, path: documents.path })
        .from(documents)
        .where(inArray(documents.id, documentIds))
        .then(rows => rows.map(r => ({ id: r.id, title: r.title ?? "", path: r.path })));
    }
  }

  const llmProvider = createLLMProvider({
    provider: config.embeddingProvider,
    geminiGeap: {
      projectId: config.gcpProjectId,
      location: config.gcpLocation,
      model: config.gcpLlmModel
    },
    openai: {
      apiKey: config.openaiApiKey,
      baseUrl: config.openaiBaseUrl,
      model: config.openaiLlmModel
    }
  });

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
  const llmResponse = await llmProvider.generate({
    prompt,
    systemInstruction,
    responseMimeType: "application/json",
    temperature: 0.2
  });

  const rawText = llmResponse.text;

  let noteData: any = null;
  try {
    const parsed = JSON.parse(rawText);
    noteData = parsed.note;
  } catch (_error) {
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        noteData = parsed.note;
      }
    } catch (_fallbackError) {
      // Ignore fallback error
    }
  }

  if (noteData) {
    const requestId = crypto.randomUUID();
    return {
      requestId,
      note: noteData,
      sources,
      retrieval: retrievalInfo
    };
  }

  return {
    error: "Failed to generate structured synthesis",
    rawResponse: rawText
  };
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
  const segmentCharacterLimit = options.segmentCharacterLimit ?? DEFAULT_SELECTED_NOTE_SEGMENT_CHARACTER_LIMIT;
  validateSelectedNoteContextOptions(characterBudget, segmentCharacterLimit);

  const chunks = sources.flatMap((source) => createSelectedNoteContextChunks(source, segmentCharacterLimit));
  const sourceManifest = formatSelectedSourceManifest(sources, chunks);
  if (sourceManifest.length > characterBudget) {
    throw new Error("Synthesis context budget is too small to label every selected source");
  }

  const contentBudget = characterBudget - sourceManifest.length - CONTEXT_BLOCK_SEPARATOR.length;

  const contextPack = contentBudget <= 0
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
