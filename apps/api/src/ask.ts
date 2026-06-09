import { createEmbeddingProvider, createLLMProvider } from "@llm-wiki/ai";
import { createLogger, hybridRetrieve } from "@llm-wiki/core";
import { createDbClient } from "@llm-wiki/db";

import type { AppConfig } from "./config";

export async function askPreview(
  config: AppConfig,
  query: string,
  topK?: number
) {
  const logger = createLogger("ask");
  logger.info("New knowledge request", { query, topK });

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
    }
  });

  const retrievalResults = await hybridRetrieve(
    {
      db,
      embeddingProvider
    },
    {
      query,
      topK
    }
  );

  logger.debug("Retrieval completed", { 
    chunks: retrievalResults.chunks.length, 
    links: retrievalResults.links.length 
  });

  const llmProvider = createLLMProvider({
    provider: config.embeddingProvider,
    geminiGeap: {
      projectId: config.gcpProjectId,
      location: config.gcpLocation,
      model: config.gcpLlmModel
    }
  });

  const contextText = retrievalResults.chunks
    .map((c, i) => `[Context ${i + 1}]:\n${c.text}`)
    .join("\n\n");

  const systemInstruction = `
You are an expert knowledge assistant for "LLM Wiki".
Your goal is to answer the user's question based on their personal Obsidian vault notes provided as context.

RULES:
1. Use ONLY the provided context to answer the question. If the answer is not in the context, say you don't know.
2. Provide a helpful, concise "answer".
3. Provide a "suggested_note" that captures the core knowledge from this interaction.
4. The "suggested_note" should be structured with a "title", "content" (markdown), and optional "links" (wikilinks format without brackets) and "tags".
5. ALWAYS output valid JSON matching the schema below.

JSON SCHEMA:
{
  "answer": "string",
  "suggested_note": {
    "title": "string",
    "content": "string (markdown)",
    "links": ["string"],
    "tags": ["string"]
  }
}
`.trim();

  const prompt = `
USER QUESTION: ${query}

CONTEXT FROM VAULT:
${contextText || "No relevant notes found in vault."}

Provide your answer and suggested note in JSON format.
`.trim();

  logger.debug("Generating LLM answer...");
  const startTime = Date.now();
  const llmResponse = await llmProvider.generate({
    prompt,
    systemInstruction,
    responseMimeType: "application/json",
    temperature: 0.2
  });
  const duration = Date.now() - startTime;

  try {
    const parsed = JSON.parse(llmResponse.text);
    const requestId = crypto.randomUUID();

    logger.info("Knowledge answer generated", { 
      requestId, 
      durationMs: duration,
      title: parsed.suggested_note?.title 
    });

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
      answer: parsed.answer,
      note: parsed.suggested_note,
      sources,
      retrieval: {
        chunkCount: retrievalResults.chunks.length,
        linkCount: retrievalResults.links.length
      }
    };
  } catch (error) {
    logger.error("Failed to parse LLM response", error, { raw: llmResponse.text });
    return {
      error: "Failed to generate structured response",
      rawResponse: llmResponse.text
    };
  }
}

export { confirmAskSave } from "./ask-confirm";
