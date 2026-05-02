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

  try {
    const parsed = JSON.parse(llmResponse.text);
    const requestId = crypto.randomUUID();
    return {
      requestId,
      note: parsed.note,
      retrieval: {
        chunkCount: retrievalResults.chunks.length,
        linkCount: retrievalResults.links.length
      }
    };
  } catch (_error) {
    return {
      error: "Failed to generate structured synthesis",
      rawResponse: llmResponse.text
    };
  }
}

