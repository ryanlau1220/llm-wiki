import crypto from "node:crypto";
import { inArray } from "drizzle-orm";

import type { LLMResponse } from "@llm-wiki/ai";
import {
  completeAiTrace,
  completeAiTraceSpan,
  createLogger,
  DEFAULT_CONTEXT_CHARACTER_BUDGET,
  hashRetrievalValue,
  hybridRetrieve,
  packRetrievalContext,
  recordAiTraceEvidence,
  AI_TRACE_OPERATION,
  AI_TRACE_SPAN_TYPE,
  AI_TRACE_STATUS,
  resolveAskRetrievalPolicy,
  shouldAbstainForMissingEvidence,
  startAiTrace,
  startAiTraceSpan,
  type RetrievalResponse,
} from "@llm-wiki/core";
import { createDbClient, documents } from "@llm-wiki/db";
import { askModelResponseSchema } from "@llm-wiki/types";

import type { AppConfig } from "./config";
import {
  createConfiguredEmbeddingProvider,
  createConfiguredLlmProvider,
  resolveConfiguredLlmModelName,
} from "./providers";
import { createInvalidModelResponse, parseStructuredModelResponse } from "./model-response";
import { modelUsageAttributes } from "./trace-usage";

export const ASK_PROMPT_VERSION = "ask-v2";
export const ASK_EVALUATION_TARGET = "ask_rag";
const ASK_TRACE_ERROR_CODE = {
  INVALID_MODEL_RESPONSE: "invalid_model_response",
  RETRIEVAL_FAILED: "retrieval_failed",
  GENERATION_FAILED: "generation_failed",
} as const;
const GROUNDED_ABSTENTION_ANSWER =
  "I couldn't find relevant information in your vault to answer that confidently.";

export type AskExecutionOptions = {
  /** Evaluation calls are bounded so a local model cannot monopolize the service indefinitely. */
  maxOutputTokens?: number;
  timeoutMs?: number;
};

export async function askPreview(
  config: AppConfig,
  query: string,
  topK?: number,
  mode: "rag" | "general" = "rag",
  executionOptions: AskExecutionOptions = {},
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
  let traceId: string | null = null;
  let requestSpanId: string | null = null;
  try {
    traceId = await startAiTrace(db, {
      operation: AI_TRACE_OPERATION.ASK,
      query,
      policy: retrievalDecision.policy,
      policyReason: retrievalDecision.reason,
      modelProvider: config.llmProvider,
      modelName: resolveConfiguredLlmModelName(config),
      promptVersion: ASK_PROMPT_VERSION,
    });
    requestSpanId = await startAiTraceSpan(db, traceId, {
      spanType: AI_TRACE_SPAN_TYPE.REQUEST,
      attributes: { mode, input_length: query.length },
    });
    const policySpan = await startAiTraceSpan(db, traceId, {
      spanType: AI_TRACE_SPAN_TYPE.POLICY,
      parentSpanId: requestSpanId,
      attributes: { policy: retrievalDecision.policy, reason_code: retrievalDecision.reason },
    });
    await completeAiTraceSpan(db, policySpan, {
      status: AI_TRACE_STATUS.SUCCEEDED,
      durationMs: 0,
      attributes: { policy: retrievalDecision.policy },
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
    const embeddingProvider = createConfiguredEmbeddingProvider(config);

    const retrievalStartedAt = Date.now();
    const retrievalSpanId = traceId
      ? await startAiTraceSpan(db, traceId, {
          spanType: AI_TRACE_SPAN_TYPE.RETRIEVAL,
          parentSpanId: requestSpanId ?? undefined,
          attributes: { top_k: topK ?? 10, retrieval_mode: "hybrid" },
        })
      : null;
    try {
      retrievalResults = await hybridRetrieve(
        {
          db,
          embeddingProvider,
        },
        {
          query,
          topK,
        },
      );
    } catch (error) {
      if (retrievalSpanId)
        await completeAiTraceSpan(db, retrievalSpanId, {
          status: AI_TRACE_STATUS.FAILED,
          durationMs: Date.now() - retrievalStartedAt,
          errorCode: ASK_TRACE_ERROR_CODE.RETRIEVAL_FAILED,
        });
      await completeAskTrace(
        db,
        traceId,
        {
          status: AI_TRACE_STATUS.FAILED,
          candidateCount: 0,
          selectedEvidenceCount: 0,
          contextCharacterCount: 0,
          durationMs: Date.now() - requestStartedAt,
          errorCode: ASK_TRACE_ERROR_CODE.RETRIEVAL_FAILED,
        },
        logger,
      );
      if (requestSpanId)
        await completeAiTraceSpan(db, requestSpanId, {
          status: AI_TRACE_STATUS.FAILED,
          durationMs: Date.now() - requestStartedAt,
          errorCode: ASK_TRACE_ERROR_CODE.RETRIEVAL_FAILED,
        });
      throw error;
    }
    if (retrievalSpanId)
      await completeAiTraceSpan(db, retrievalSpanId, {
        status: AI_TRACE_STATUS.SUCCEEDED,
        durationMs: Date.now() - retrievalStartedAt,
        attributes: {
          candidate_count: retrievalResults.chunks.length,
          link_count: retrievalResults.links.length,
        },
      });

    logger.debug("Retrieval completed", {
      chunks: retrievalResults.chunks.length,
      links: retrievalResults.links.length,
    });

    const packingStartedAt = Date.now();
    const packingSpanId = traceId
      ? await startAiTraceSpan(db, traceId, {
          spanType: AI_TRACE_SPAN_TYPE.CONTEXT_PACKING,
          parentSpanId: requestSpanId ?? undefined,
          attributes: { candidate_count: retrievalResults.chunks.length },
        })
      : null;
    const contextPack = packRetrievalContext(retrievalResults.chunks);
    if (packingSpanId)
      await completeAiTraceSpan(db, packingSpanId, {
        status: AI_TRACE_STATUS.SUCCEEDED,
        durationMs: Date.now() - packingStartedAt,
        attributes: {
          selected_count: contextPack.chunks.length,
          packed_characters: contextPack.characterCount,
        },
      });
    packedCitationChunks = contextPack.chunks;
    packedCitationIds = new Set(contextPack.chunks.map((_chunk, index) => index + 1));
    if (traceId) {
      try {
        tracedEvidenceCount = await recordAiTraceEvidence(
          db,
          traceId,
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
        logger.error("Failed to record retrieval evidence", error, { traceId });
      }
    }

    contextText = contextPack.text;
    if (shouldAbstainForMissingEvidence(retrievalDecision, contextPack.chunks.length)) {
      const requestId = traceId ?? crypto.randomUUID();
      logger.info("Abstained from ungrounded vault answer", {
        requestId,
        candidateCount: retrievalResults.chunks.length,
        policy: retrievalDecision.policy,
        policyReason: retrievalDecision.reason,
      });
      await completeAskTrace(
        db,
        traceId,
        {
          status: AI_TRACE_STATUS.SUCCEEDED,
          candidateCount: retrievalResults.chunks.length,
          selectedEvidenceCount: tracedEvidenceCount,
          contextCharacterCount: contextPack.characterCount,
          durationMs: Date.now() - requestStartedAt,
        },
        logger,
      );
      if (requestSpanId)
        await completeAiTraceSpan(db, requestSpanId, {
          status: AI_TRACE_STATUS.SUCCEEDED,
          durationMs: Date.now() - requestStartedAt,
          attributes: { abstained: true, citation_count: 0 },
        });
      return {
        requestId,
        traceId,
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
      const toolStartedAt = Date.now();
      const toolSpanId = traceId
        ? await startAiTraceSpan(db, traceId, {
            spanType: AI_TRACE_SPAN_TYPE.TOOL,
            parentSpanId: requestSpanId ?? undefined,
            attributes: { tool_name: "web_search", max_results: 5 },
          })
        : null;
      let webSearchFailed = false;
      try {
        const { createWebSearchProvider } = await import("@llm-wiki/ai");
        const searchProvider = createWebSearchProvider({
          tavily: { apiKey: config.tavilyApiKey },
        });
        const searchResponse = await searchProvider.search({ query, maxResults: 5 });
        contextText = (searchResponse.results || [])
          .map((r, i) => `[Web Search Context ${i + 1}] (${r.title} - ${r.url}):\n${r.content}`)
          .join("\n\n");
      } catch (err) {
        logger.error("Tavily search failed, falling back to local weights...", err);
        webSearchFailed = true;
        if (toolSpanId)
          await completeAiTraceSpan(db, toolSpanId, {
            status: AI_TRACE_STATUS.FAILED,
            durationMs: Date.now() - toolStartedAt,
            errorCode: "web_search_failed",
          });
      }
      if (toolSpanId && !webSearchFailed)
        await completeAiTraceSpan(db, toolSpanId, {
          status: AI_TRACE_STATUS.SUCCEEDED,
          durationMs: Date.now() - toolStartedAt,
          attributes: { enabled: true },
        });
    } else if (config.llmProvider === "gemini" || config.llmProvider === "gemini-geap") {
      logger.info("Using native Gemini search grounding...");
      webSearchEnabled = true;
    } else {
      logger.warn(
        "No web search key configured and active provider is not Gemini. Answering with model knowledge only.",
      );
    }
  }

  const llmProvider = createConfiguredLlmProvider(config);

  const systemInstruction = buildAskSystemInstruction(mode);

  const prompt =
    mode === "rag"
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
  const modelSpanId = traceId
    ? await startAiTraceSpan(db, traceId, {
        spanType: AI_TRACE_SPAN_TYPE.MODEL,
        parentSpanId: requestSpanId ?? undefined,
        attributes: {
          provider: config.llmProvider,
          response_format: "json",
          web_search: webSearchEnabled,
        },
      })
    : null;
  let llmResponse: LLMResponse;
  try {
    llmResponse = await llmProvider.generate({
      prompt,
      systemInstruction,
      responseMimeType: "application/json",
      temperature: 0.2,
      webSearch: webSearchEnabled,
      maxOutputTokens: executionOptions.maxOutputTokens,
      timeoutMs: executionOptions.timeoutMs,
    });
  } catch (error) {
    if (modelSpanId)
      await completeAiTraceSpan(db, modelSpanId, {
        status: AI_TRACE_STATUS.FAILED,
        durationMs: Date.now() - generationStartedAt,
        errorCode: ASK_TRACE_ERROR_CODE.GENERATION_FAILED,
      });
    await completeAskTrace(
      db,
      traceId,
      {
        status: AI_TRACE_STATUS.FAILED,
        candidateCount: retrievalResults.chunks.length,
        selectedEvidenceCount: tracedEvidenceCount,
        contextCharacterCount: contextText.length,
        durationMs: Date.now() - requestStartedAt,
        errorCode: ASK_TRACE_ERROR_CODE.GENERATION_FAILED,
      },
      logger,
    );
    if (requestSpanId)
      await completeAiTraceSpan(db, requestSpanId, {
        status: AI_TRACE_STATUS.FAILED,
        durationMs: Date.now() - requestStartedAt,
        errorCode: ASK_TRACE_ERROR_CODE.GENERATION_FAILED,
      });
    throw error;
  }
  let parsed = parseStructuredModelResponse(llmResponse.text, askModelResponseSchema);
  if (parsed.success) {
    if (modelSpanId)
      await completeAiTraceSpan(db, modelSpanId, {
        status: AI_TRACE_STATUS.SUCCEEDED,
        durationMs: Date.now() - generationStartedAt,
        attributes: {
          provider: config.llmProvider,
          response_format: "json",
          ...modelUsageAttributes(llmResponse.usage),
        },
      });
  } else {
    if (modelSpanId)
      await completeAiTraceSpan(db, modelSpanId, {
        status: AI_TRACE_STATUS.FAILED,
        durationMs: Date.now() - generationStartedAt,
        attributes: {
          provider: config.llmProvider,
          response_format: "json",
          ...modelUsageAttributes(llmResponse.usage),
        },
        errorCode: ASK_TRACE_ERROR_CODE.INVALID_MODEL_RESPONSE,
      });
    const retryStartedAt = Date.now();
    const retrySpanId = traceId
      ? await startAiTraceSpan(db, traceId, {
          spanType: AI_TRACE_SPAN_TYPE.RETRY,
          parentSpanId: requestSpanId ?? undefined,
          attributes: {
            reason_code: parsed.reason,
            response_format: "json",
            max_output_tokens: repairOutputTokenBudget(executionOptions.maxOutputTokens),
          },
        })
      : null;
    try {
      llmResponse = await llmProvider.generate({
        prompt: buildAskJsonRepairPrompt(prompt),
        systemInstruction,
        responseMimeType: "application/json",
        temperature: 0,
        webSearch: webSearchEnabled,
        maxOutputTokens: repairOutputTokenBudget(executionOptions.maxOutputTokens),
        timeoutMs: executionOptions.timeoutMs,
      });
      parsed = parseStructuredModelResponse(llmResponse.text, askModelResponseSchema);
      if (parsed.success) {
        if (retrySpanId)
          await completeAiTraceSpan(db, retrySpanId, {
            status: AI_TRACE_STATUS.SUCCEEDED,
            durationMs: Date.now() - retryStartedAt,
            attributes: { ...modelUsageAttributes(llmResponse.usage) },
          });
      } else if (retrySpanId) {
        await completeAiTraceSpan(db, retrySpanId, {
          status: AI_TRACE_STATUS.FAILED,
          durationMs: Date.now() - retryStartedAt,
          errorCode: ASK_TRACE_ERROR_CODE.INVALID_MODEL_RESPONSE,
        });
      }
    } catch {
      if (retrySpanId)
        await completeAiTraceSpan(db, retrySpanId, {
          status: AI_TRACE_STATUS.FAILED,
          durationMs: Date.now() - retryStartedAt,
          errorCode: ASK_TRACE_ERROR_CODE.GENERATION_FAILED,
        });
    }
  }
  const duration = Date.now() - generationStartedAt;
  if (!parsed.success) {
    logger.error("Failed to validate LLM response", new Error(parsed.reason), {
      responseLength: llmResponse.text.length,
      reason: parsed.reason,
    });
    await completeAskTrace(
      db,
      traceId,
      {
        status: AI_TRACE_STATUS.FAILED,
        candidateCount: retrievalResults.chunks.length,
        selectedEvidenceCount: tracedEvidenceCount,
        contextCharacterCount: contextText.length,
        durationMs: Date.now() - requestStartedAt,
        errorCode: ASK_TRACE_ERROR_CODE.INVALID_MODEL_RESPONSE,
      },
      logger,
    );
    if (requestSpanId)
      await completeAiTraceSpan(db, requestSpanId, {
        status: AI_TRACE_STATUS.FAILED,
        durationMs: Date.now() - requestStartedAt,
        errorCode: ASK_TRACE_ERROR_CODE.INVALID_MODEL_RESPONSE,
      });
    return { ...createInvalidModelResponse(), traceId };
  }

  const requestId = traceId ?? crypto.randomUUID();
  logger.info("Knowledge answer generated", {
    requestId,
    durationMs: duration,
    title: parsed.data.suggested_note.title,
  });

  await completeAskTrace(
    db,
    traceId,
    {
      status: AI_TRACE_STATUS.SUCCEEDED,
      candidateCount: retrievalResults.chunks.length,
      selectedEvidenceCount: tracedEvidenceCount,
      contextCharacterCount: contextText.length,
      durationMs: Date.now() - requestStartedAt,
    },
    logger,
  );
  const documentIds = [...new Set(retrievalResults.chunks.map((chunk) => chunk.documentId))];
  const sources = documentIds.length
    ? await db
        .select({ id: documents.id, title: documents.title, path: documents.path })
        .from(documents)
        .where(inArray(documents.id, documentIds))
    : [];
  const sourceTitleById = new Map(sources.map((source) => [source.id, source.title]));
  const citations = filterCitations(parsed.data.citations, packedCitationIds).map((citation) => {
    const chunk = packedCitationChunks[citation - 1]!;
    return {
      id: citation,
      documentId: chunk.documentId,
      title: sourceTitleById.get(chunk.documentId) ?? chunk.documentPath,
      path: chunk.documentPath,
      chunkIndex: chunk.chunkIndex,
    };
  });
  const finalAnswerSpanId = traceId
    ? await startAiTraceSpan(db, traceId, {
        spanType: AI_TRACE_SPAN_TYPE.FINAL_ANSWER,
        parentSpanId: requestSpanId ?? undefined,
        attributes: { citation_count: citations.length },
      })
    : null;
  if (finalAnswerSpanId)
    await completeAiTraceSpan(db, finalAnswerSpanId, {
      status: AI_TRACE_STATUS.SUCCEEDED,
      durationMs: 0,
      attributes: { citation_count: citations.length },
    });
  if (requestSpanId)
    await completeAiTraceSpan(db, requestSpanId, {
      status: AI_TRACE_STATUS.SUCCEEDED,
      durationMs: Date.now() - requestStartedAt,
      attributes: { citation_count: citations.length },
    });

  return {
    requestId,
    traceId,
    answer: parsed.data.answer,
    note: parsed.data.suggested_note,
    citations,
    sources,
    retrieval: {
      chunkCount: retrievalResults.chunks.length,
      linkCount: retrievalResults.links.length,
      policy: retrievalDecision.policy,
      policyReason: retrievalDecision.reason,
      abstained: false,
    },
  };
}

export function buildAskSystemInstruction(mode: "rag" | "general"): string {
  if (mode === "rag") {
    return `
You are an expert knowledge assistant for "LLM Wiki".
Your goal is to answer the user's question based on their personal Obsidian vault notes provided as context.

RULES:
1. Use ONLY the provided context to answer the question. If the answer is not in the context, say you don't know.
2. Provide a helpful, concise "answer".
3. Provide a "suggested_note" that captures the core knowledge from this interaction.
4. The "suggested_note" should be structured with a "title", "content" (markdown), and optional "links" (concepts list without brackets) and "tags".
5. ALWAYS output valid JSON matching the schema below.
6. CRITICAL WIKILINK FORMAT: Always format internal links to other concepts as Obsidian-style wikilinks [[Concept Name]] (e.g., [[Machine Learning]]) directly inside the markdown content text.
7. "citations" MUST be an array of positive integer context numbers. Do not quote the numbers; use [] when no context supports the answer.

JSON SCHEMA:
{
  "answer": "string",
  "suggested_note": {
    "title": "string",
    "content": "string (markdown)",
    "links": ["string"],
    "tags": ["string"]
  },
  "citations": [1, 2]
}

`.trim();
  }

  return `
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
}

/** A fresh, bounded request is safer than accepting prose-wrapped JSON. */
export function buildAskJsonRepairPrompt(prompt: string): string {
  return `${prompt}\n\nYour previous response was not a complete valid JSON object. Return only one complete JSON object that matches the requested schema. Keep suggested_note.content concise (under 1,200 characters).`;
}

export function repairOutputTokenBudget(initialBudget: number | undefined): number {
  return Math.max(initialBudget ?? 0, 768);
}

/** Immutable, structural description of the executable Ask/RAG target. */
export function buildAskWorkflowManifest(config: AppConfig, topK: number) {
  return {
    target: ASK_EVALUATION_TARGET,
    targetVersion: ASK_PROMPT_VERSION,
    policy: "vault_hybrid",
    topK,
    contextCharacterBudget: DEFAULT_CONTEXT_CHARACTER_BUDGET,
    modelProvider: config.llmProvider,
    modelName: resolveConfiguredLlmModelName(config) ?? null,
  };
}

function filterCitations(citations: number[], allowedCitationIds: Set<number>): number[] {
  return [...new Set(citations)].filter((citation) => allowedCitationIds.has(citation));
}

async function completeAskTrace(
  db: ReturnType<typeof createDbClient>["db"],
  traceId: string | null,
  input: Parameters<typeof completeAiTrace>[2],
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  if (!traceId) return;
  try {
    await completeAiTrace(db, traceId, input);
  } catch (error) {
    logger.error("Failed to complete AI trace", error, { traceId });
  }
}

export { confirmAskSave } from "./ask-confirm";
