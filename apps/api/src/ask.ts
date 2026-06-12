import crypto from "node:crypto";
import { createEmbeddingProvider, createLLMProvider } from "@llm-wiki/ai";
import { createLogger, hybridRetrieve } from "@llm-wiki/core";
import { createDbClient } from "@llm-wiki/db";

import type { AppConfig } from "./config";

export async function askPreview(
  config: AppConfig,
  query: string,
  topK?: number,
  mode: "rag" | "general" = "rag"
) {
  const logger = createLogger("ask");
  logger.info("New knowledge request", { query, topK, mode });

  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const { db } = createDbClient(config.databaseUrl);
  
  let contextText = "";
  let webSearchEnabled = false;
  let retrievalResults: any = { chunks: [], links: [] };

  if (mode === "rag") {
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

    retrievalResults = await hybridRetrieve(
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

    contextText = (retrievalResults.chunks as any[])
      .map((c: any, i: number) => `[Context ${i + 1}]:\n${c.text}`)
      .join("\n\n");
  } else {
    // General Knowledge / Web Search mode
    if (config.tavilyApiKey) {
      logger.info("Performing web search via Tavily...");
      try {
        const { createWebSearchProvider } = await import("@llm-wiki/ai");
        const searchProvider = createWebSearchProvider({
          tavily: { apiKey: config.tavilyApiKey }
        });
        const searchResponse = await searchProvider.search({ query, maxResults: 5 });
        contextText = (searchResponse.results || [])
          .map((r, i) => `[Web Search Context ${i + 1}] (${r.title} - ${r.url}):\n${r.content}`)
          .join("\n\n");
      } catch (err) {
        logger.error("Tavily search failed, falling back to local weights...", err);
      }
    } else if (config.embeddingProvider === "gemini" || config.embeddingProvider === "gemini-geap") {
      logger.info("Using native Gemini search grounding...");
      webSearchEnabled = true;
    } else {
      logger.warn("No web search key configured and active provider is not Gemini. Answering with model knowledge only.");
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

  const systemInstruction = mode === "rag" 
    ? `
You are an expert knowledge assistant for "LLM Wiki".
Your goal is to answer the user's question based on their personal Obsidian vault notes provided as context.

RULES:
1. Use ONLY the provided context to answer the question. If the answer is not in the context, say you don't know.
2. Provide a helpful, concise "answer".
3. Provide a "suggested_note" that captures the core knowledge from this interaction.
4. The "suggested_note" should be structured with a "title", "content" (markdown), and optional "links" (concepts list without brackets) and "tags".
5. ALWAYS output valid JSON matching the schema below.
6. CRITICAL WIKILINK FORMAT: Always format internal links to other concepts as Obsidian-style wikilinks [[Concept Name]] (e.g., [[Machine Learning]]) directly inside the markdown content text.

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
`.trim()
    : `
You are an expert knowledge assistant for "LLM Wiki".
Your goal is to answer the user's question using general knowledge (and any provided web search context).

RULES:
1. Provide a helpful, comprehensive yet concise "answer" incorporating relevant facts.
2. Provide a "suggested_note" that summarizes the core knowledge, concepts, or guidelines discussed so the user can save it as a structured wiki page.
3. The "suggested_note" should be structured with a "title", "content" (markdown, without frontmatter), and optional "links" (concepts list without brackets) and "tags".
4. ALWAYS output valid JSON matching the schema below.
5. CRITICAL WIKILINK FORMAT: Always format internal links to other concepts as Obsidian-style wikilinks [[Concept Name]] (e.g., [[Machine Learning]]) directly inside the markdown content text.

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

  const prompt = mode === "rag"
    ? `
USER QUESTION: ${query}

CONTEXT FROM VAULT:
${contextText || "No relevant notes found in vault."}

Provide your answer and suggested note in JSON format.
`.trim()
    : `
USER QUESTION: ${query}

${contextText ? `CONTEXT FROM WEB SEARCH:\n${contextText}` : ""}

Provide your answer and suggested note in JSON format.
`.trim();

  logger.debug("Generating LLM answer...");
  const startTime = Date.now();
  const llmResponse = await llmProvider.generate({
    prompt,
    systemInstruction,
    responseMimeType: "application/json",
    temperature: 0.2,
    webSearch: webSearchEnabled
  } as any);
  const duration = Date.now() - startTime;

  try {
    const parsed = JSON.parse(llmResponse.text);
    const requestId = crypto.randomUUID();

    logger.info("Knowledge answer generated", { 
      requestId, 
      durationMs: duration,
      title: parsed.suggested_note?.title 
    });

    const documentIds = [...new Set((retrievalResults.chunks || []).map((c: any) => c.documentId))];
    let sources: Array<{ id: string; title: string; path: string }> = [];
    if (documentIds.length > 0) {
      const { inArray } = await import("drizzle-orm");
      const { documents } = await import("@llm-wiki/db");
      sources = await db
        .select({ id: documents.id, title: documents.title, path: documents.path })
        .from(documents)
        .where(inArray(documents.id, documentIds as string[]));
    }

    return {
      requestId,
      answer: parsed.answer,
      note: parsed.suggested_note,
      sources,
      retrieval: {
        chunkCount: (retrievalResults.chunks || []).length,
        linkCount: (retrievalResults.links || []).length
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
