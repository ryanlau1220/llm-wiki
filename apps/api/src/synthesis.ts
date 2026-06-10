import crypto from "node:crypto";

import { createEmbeddingProvider, createLLMProvider } from "@llm-wiki/ai";
import { createLogger, hybridRetrieve } from "@llm-wiki/core";
import { createDbClient } from "@llm-wiki/db";

import type { AppConfig } from "./config";

export async function synthesisPreview(config: AppConfig, topic: string, topK?: number) {
  const logger = createLogger("synthesis");
  logger.info("New synthesis request", { topic, topK });

  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const { db } = createDbClient(config.databaseUrl);

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

  const contextText = retrievalResults.chunks
    .map((c, i) => `[Source ${i + 1}]:\n${c.text}`)
    .join("\n\n");

  const systemInstruction = `
You are an expert knowledge synthesizer for "LLM Wiki".
Your job is to synthesize a wiki-style note from the provided sources.

RULES:
1. Use ONLY the provided sources. If sources are insufficient, say so in the content.
2. Produce a clean, structured markdown note.
3. Suggest related wikilinks (labels only, no brackets).
4. Output valid JSON matching the schema below.
5. IMPORTANT: NEVER use unescaped double quotes inside the "content" or "title" string values. If you need to emphasize something or use a quote within the text, use single quotes (') or markdown bolding (**text**) instead. Unescaped double quotes will break the JSON parsing and fail the task.

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
    const documentIds = [...new Set(retrievalResults.chunks.map((c) => c.documentId))];
    let sources: Array<{ id: string; title: string; path: string }> = [];
    if (documentIds.length > 0) {
      const { inArray } = await import("drizzle-orm");
      const { documents } = await import("@llm-wiki/db");
      sources = await db
        .select({ id: documents.id, title: documents.title, path: documents.path })
        .from(documents)
        .where(inArray(documents.id, documentIds));
    }
    return {
      requestId,
      note: noteData,
      sources,
      retrieval: {
        chunkCount: retrievalResults.chunks.length,
        linkCount: retrievalResults.links.length
      }
    };
  }

  return {
    error: "Failed to generate structured synthesis",
    rawResponse: rawText
  };
}

