import crypto from "node:crypto";
import { inArray } from "drizzle-orm";

import { createEmbeddingProvider, createLLMProvider, type LLMResponse } from "@llm-wiki/ai";
import {
  completeRetrievalRun,
  createLogger,
  hashRetrievalValue,
  hybridRetrieve,
  packRetrievalContext,
  recordRetrievalEvidence,
  RETRIEVAL_OPERATION,
  RETRIEVAL_RUN_STATUS,
  resolveAskRetrievalPolicy,
  shouldAbstainForMissingEvidence,
  startRetrievalRun,
  type RetrievalResponse,
} from "@llm-wiki/core";
import { createDbClient, documents } from "@llm-wiki/db";

import type { AppConfig } from "./config";

const ASK_PROMPT_VERSION = "ask-v1";
const ASK_TRACE_ERROR_CODE = {
  INVALID_MODEL_RESPONSE: "invalid_model_response",
  RETRIEVAL_FAILED: "retrieval_failed",
  GENERATION_FAILED: "generation_failed",
} as const;
const GROUNDED_ABSTENTION_ANSWER = "I couldn't find relevant information in your vault to answer that confidently.";

export async function askPreview(
  config: AppConfig,
  query: string,
  topK?: number,
  mode: "rag" | "general" = "rag"
) {
  const logger = createLogger("ask");
  logger.info("New knowledge request", {
    queryHash: hashRetrievalValue(query),
    queryLength: query.length,
    topK,
    mode,
  });

  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const { db } = createDbClient(config.databaseUrl);
  const requestStartedAt = Date.now();
  const retrievalDecision = resolveAskRetrievalPolicy(mode);
  let retrievalRunId: string | null = null;
  try {
    retrievalRunId = await startRetrievalRun(db, {
      operation: RETRIEVAL_OPERATION.ASK,
      query,
      policy: retrievalDecision.policy,
      policyReason: retrievalDecision.reason,
      modelProvider: config.embeddingProvider,
      modelName: resolveLlmModelName(config),
      promptVersion: ASK_PROMPT_VERSION,
    });
  } catch (error) {
    logger.error("Failed to start retrieval trace", error);
  }

  let contextText = "";
  let packedCitationIds = new Set<number>();
  let packedCitationChunks: RetrievalResponse["chunks"] = [];
  let webSearchEnabled = false;
  let retrievalResults: RetrievalResponse = { chunks: [], links: [] };
  let tracedEvidenceCount = 0;

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

    try {
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
    } catch (error) {
      await completeAskTrace(db, retrievalRunId, {
        status: RETRIEVAL_RUN_STATUS.FAILED,
        candidateCount: 0,
        selectedEvidenceCount: 0,
        contextCharacterCount: 0,
        durationMs: Date.now() - requestStartedAt,
        errorCode: ASK_TRACE_ERROR_CODE.RETRIEVAL_FAILED,
      }, logger);
      throw error;
    }

    logger.debug("Retrieval completed", {
      chunks: retrievalResults.chunks.length,
      links: retrievalResults.links.length
    });

    const contextPack = packRetrievalContext(retrievalResults.chunks);
    packedCitationChunks = contextPack.chunks;
    packedCitationIds = new Set(contextPack.chunks.map((_chunk, index) => index + 1));
    if (retrievalRunId) {
      try {
        tracedEvidenceCount = await recordRetrievalEvidence(
          db,
          retrievalRunId,
          contextPack.chunks.map((chunk, index) => ({
            documentId: chunk.documentId,
            documentPath: chunk.documentPath,
            chunkIndex: chunk.chunkIndex,
            contentHash: hashRetrievalValue(chunk.text),
            source: chunk.source,
            score: chunk.score,
            retrievalRank: index + 1,
            selectionRank: index + 1,
          })),
        );
      } catch (error) {
        logger.error("Failed to record retrieval evidence", error, { retrievalRunId });
      }
    }

    contextText = contextPack.text;
    if (shouldAbstainForMissingEvidence(retrievalDecision, contextPack.chunks.length)) {
      const requestId = retrievalRunId ?? crypto.randomUUID();
      logger.info("Abstained from ungrounded vault answer", {
        requestId,
        candidateCount: retrievalResults.chunks.length,
        policy: retrievalDecision.policy,
        policyReason: retrievalDecision.reason,
      });
      await completeAskTrace(db, retrievalRunId, {
        status: RETRIEVAL_RUN_STATUS.SUCCEEDED,
        candidateCount: retrievalResults.chunks.length,
        selectedEvidenceCount: tracedEvidenceCount,
        contextCharacterCount: contextPack.characterCount,
        durationMs: Date.now() - requestStartedAt,
      }, logger);
      return {
        requestId,
        answer: GROUNDED_ABSTENTION_ANSWER,
        note: null,
        citations: [],
        sources: [],
        retrieval: {
          chunkCount: retrievalResults.chunks.length,
          linkCount: retrievalResults.links.length,
          policy: retrievalDecision.policy,
          policyReason: retrievalDecision.reason,
          abstained: true,
        },
      };
    }
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
  },
  "citations": ["Context number used to support the answer"]
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
  const generationStartedAt = Date.now();
  let llmResponse: LLMResponse;
  try {
    llmResponse = await llmProvider.generate({
      prompt,
      systemInstruction,
      responseMimeType: "application/json",
      temperature: 0.2,
      webSearch: webSearchEnabled
    });
  } catch (error) {
    await completeAskTrace(db, retrievalRunId, {
      status: RETRIEVAL_RUN_STATUS.FAILED,
      candidateCount: retrievalResults.chunks.length,
      selectedEvidenceCount: tracedEvidenceCount,
      contextCharacterCount: contextText.length,
      durationMs: Date.now() - requestStartedAt,
      errorCode: ASK_TRACE_ERROR_CODE.GENERATION_FAILED,
    }, logger);
    throw error;
  }
  const duration = Date.now() - generationStartedAt;

  let parsed: { answer: string; suggested_note: unknown; citations?: unknown };
  try {
    parsed = JSON.parse(llmResponse.text);
  } catch (error) {
    logger.error("Failed to parse LLM response", error, { responseLength: llmResponse.text.length });
    await completeAskTrace(db, retrievalRunId, {
      status: RETRIEVAL_RUN_STATUS.FAILED,
      candidateCount: retrievalResults.chunks.length,
      selectedEvidenceCount: tracedEvidenceCount,
      contextCharacterCount: contextText.length,
      durationMs: Date.now() - requestStartedAt,
      errorCode: ASK_TRACE_ERROR_CODE.INVALID_MODEL_RESPONSE,
    }, logger);
    return {
      error: "Failed to generate structured response",
      rawResponse: llmResponse.text
    };
  }

  const requestId = retrievalRunId ?? crypto.randomUUID();
  logger.info("Knowledge answer generated", {
    requestId,
    durationMs: duration,
    title: getSuggestedNoteTitle(parsed.suggested_note),
  });

  await completeAskTrace(db, retrievalRunId, {
    status: RETRIEVAL_RUN_STATUS.SUCCEEDED,
    candidateCount: retrievalResults.chunks.length,
    selectedEvidenceCount: tracedEvidenceCount,
    contextCharacterCount: contextText.length,
    durationMs: Date.now() - requestStartedAt,
  }, logger);

  const documentIds = [...new Set(retrievalResults.chunks.map((chunk) => chunk.documentId))];
  const sources = documentIds.length
    ? await db
      .select({ id: documents.id, title: documents.title, path: documents.path })
      .from(documents)
      .where(inArray(documents.id, documentIds))
    : [];
  const sourceTitleById = new Map(sources.map((source) => [source.id, source.title]));
  const citations = filterCitations(parsed.citations, packedCitationIds).map((citation) => {
    const chunk = packedCitationChunks[citation - 1]!;
    return {
      id: citation,
      documentId: chunk.documentId,
      title: sourceTitleById.get(chunk.documentId) ?? chunk.documentPath,
      path: chunk.documentPath,
      chunkIndex: chunk.chunkIndex,
    };
  });

  return {
    requestId,
    answer: parsed.answer,
    note: parsed.suggested_note,
    citations,
    sources,
    retrieval: {
      chunkCount: retrievalResults.chunks.length,
      linkCount: retrievalResults.links.length,
      policy: retrievalDecision.policy,
      policyReason: retrievalDecision.reason,
      abstained: false,
    }
  };
}

function filterCitations(citations: unknown, allowedCitationIds: Set<number>): number[] {
  if (!Array.isArray(citations)) return [];
  return [...new Set(citations)]
    .filter((citation): citation is number => Number.isInteger(citation))
    .filter((citation) => allowedCitationIds.has(citation));
}

function resolveLlmModelName(config: AppConfig): string | undefined {
  if (config.embeddingProvider === "openai") return config.openaiLlmModel;
  if (config.embeddingProvider === "ollama") return config.ollamaLlmModel;
  return config.gcpLlmModel;
}

function getSuggestedNoteTitle(suggestedNote: unknown): string | undefined {
  if (!suggestedNote || typeof suggestedNote !== "object") return undefined;
  const title = (suggestedNote as { title?: unknown }).title;
  return typeof title === "string" ? title : undefined;
}

async function completeAskTrace(
  db: ReturnType<typeof createDbClient>["db"],
  retrievalRunId: string | null,
  input: Parameters<typeof completeRetrievalRun>[2],
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  if (!retrievalRunId) return;
  try {
    await completeRetrievalRun(db, retrievalRunId, input);
  } catch (error) {
    logger.error("Failed to complete retrieval trace", error, { retrievalRunId });
  }
}

export { confirmAskSave } from "./ask-confirm";
