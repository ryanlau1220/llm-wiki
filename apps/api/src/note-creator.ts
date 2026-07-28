import crypto from "node:crypto";
import { sql, inArray } from "drizzle-orm";

import { createLLMProvider } from "@llm-wiki/ai";
import { createDbClient, documents, links } from "@llm-wiki/db";
import { AI_TRACE_OPERATION, AI_TRACE_POLICY, AI_TRACE_SPAN_TYPE, AI_TRACE_STATUS, completeAiTrace, completeAiTraceSpan, createLogger, startAiTrace, startAiTraceSpan } from "@llm-wiki/core";

import type { AppConfig } from "./config";

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractContextSnippets(content: string, title: string): string[] {
  const paragraphs = content.split(/\n+/);
  const regex = new RegExp(`\\[\\[${escapeRegExp(title)}(?:#[^\\]|]+)?(?:\\|[^\\]]+)?\\]\\]`, "i");

  const snippets: string[] = [];
  for (const para of paragraphs) {
    if (regex.test(para)) {
      snippets.push(para.trim());
    }
  }
  return snippets;
}

export async function generateBootstrapPreview(
  config: AppConfig,
  title: string
): Promise<{
  requestId: string;
  note: {
    title: string;
    content: string;
    links?: string[];
    tags?: string[];
  };
  traceId: string | null;
}> {
  const logger = createLogger("bootstrapper");
  logger.info("Generating bootstrap note preview", { title });

  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required to generate bootstrap preview");
  }

  const { db } = createDbClient(config.databaseUrl);
  const traceStartedAt = Date.now();
  let traceId: string | null = null;
  let requestSpanId: string | null = null;
  try {
    traceId = await startAiTrace(db, { operation: AI_TRACE_OPERATION.BOOTSTRAP, query: title, policy: AI_TRACE_POLICY.NO_RETRIEVAL, policyReason: "unresolved_link_bootstrap", modelProvider: config.embeddingProvider, modelName: config.embeddingProvider === "openai" ? config.openaiLlmModel : config.gcpLlmModel, promptVersion: "bootstrap-v1" });
    requestSpanId = await startAiTraceSpan(db, traceId, { spanType: AI_TRACE_SPAN_TYPE.REQUEST, attributes: { input_length: title.length } });
  } catch (error) { logger.error("Failed to start bootstrap trace", error); }

  // 1. Fetch referencing notes
  const referencingLinks = await db
    .select({
      sourceId: links.source_document_id,
      sourcePath: links.source_path,
    })
    .from(links)
    .where(
      sql`lower(${links.target_label}) = lower(${title})`
    );

  const snippets: string[] = [];
  if (referencingLinks.length > 0) {
    const sourceIds = referencingLinks.map((l) => l.sourceId);
    const sourceDocs = await db
      .select({
        title: documents.title,
        content: documents.content,
      })
      .from(documents)
      .where(inArray(documents.id, sourceIds));

    for (const doc of sourceDocs) {
      const docSnippets = extractContextSnippets(doc.content, title);
      for (const snippet of docSnippets) {
        snippets.push(`From note "${doc.title}": ${snippet}`);
      }
    }
  }

  // 2. Fetch all existing note titles
  const allDocs = await db.select({ title: documents.title }).from(documents);
  const existingTitles = allDocs.map((d) => d.title);

  // 3. Initialize LLM provider
  const llmProvider = createLLMProvider({
    provider: config.embeddingProvider as any,
    geminiGeap: {
      projectId: config.gcpProjectId,
      location: config.gcpLocation,
      model: config.gcpLlmModel,
    },
    ollama: {
      baseUrl: config.ollamaBaseUrl,
      model: config.ollamaLlmModel,
    },
    openai: {
      apiKey: config.openaiApiKey,
      baseUrl: config.openaiBaseUrl,
      model: config.openaiLlmModel,
    },
  });

  // 4. Construct prompts
  const systemInstruction = `
You are an expert technical writer for the "LLM Wiki".
Your goal is to write a comprehensive, structured definition and explanatory note for the concept: "${title}".

RULES:
1. Provide a high-quality definition of the concept, followed by key sections or subtopics using Markdown.
2. Do NOT write metadata frontmatter (YAML block) inside the note content.
3. STRICT WIKILINK INTEGRITY: You MUST format references to other concepts as Obsidian double-bracketed wikilinks (e.g., [[Concept Name]]) directly inside your text.
4. HALLUCINATION PREVENTION: You are ONLY allowed to link to concepts that are in the list of existing notes provided in the prompt. Do NOT create links to terms that do not exist.
5. ALWAYS output valid JSON matching the schema below.

JSON SCHEMA:
{
  "title": "string",
  "content": "string (markdown)",
  "links": ["string (related concepts list, without brackets)"],
  "tags": ["string (relevant tags)"]
}
`.trim();

  const prompt = `
CONCEPT TO DEFINE: ${title}

${
  snippets.length > 0
    ? `CONTEXT FROM REFERENCES IN OTHER NOTES:\n${snippets.slice(0, 10).join("\n")}`
    : "No referencing context found."
}

EXISTING NOTE TITLES IN THE WIKI (ONLY link to these names):
${existingTitles.length > 0 ? existingTitles.map((t) => `- ${t}`).join("\n") : "No existing notes."}

Generate the definition note in the requested JSON format.
`.trim();

  logger.debug("Calling LLM to generate bootstrap definition...");
  const startTime = Date.now();
  const modelSpanId = traceId ? await startAiTraceSpan(db, traceId, { spanType: AI_TRACE_SPAN_TYPE.MODEL, parentSpanId: requestSpanId ?? undefined, attributes: { provider: config.embeddingProvider, response_format: "json" } }) : null;
  let llmResponse: { text: string };
  try { llmResponse = await llmProvider.generate({ prompt, systemInstruction, responseMimeType: "application/json", temperature: 0.2 } as any); }
  catch (error) { if (modelSpanId) await completeAiTraceSpan(db, modelSpanId, { status: AI_TRACE_STATUS.FAILED, durationMs: Date.now() - startTime, errorCode: "generation_failed" }); await completeBootstrapTrace(db, traceId, requestSpanId, { status: AI_TRACE_STATUS.FAILED, candidateCount: referencingLinks.length, selectedEvidenceCount: snippets.length, contextCharacterCount: 0, durationMs: Date.now() - traceStartedAt, errorCode: "generation_failed" }); throw error; }
  const duration = Date.now() - startTime;
  if (modelSpanId) await completeAiTraceSpan(db, modelSpanId, { status: AI_TRACE_STATUS.SUCCEEDED, durationMs: duration, attributes: { provider: config.embeddingProvider } });

  try {
    const parsed = JSON.parse(llmResponse.text);
    const requestId = traceId ?? crypto.randomUUID();

    logger.info("Bootstrap preview generated successfully", {
      requestId,
      durationMs: duration,
    });
    await completeBootstrapTrace(db, traceId, requestSpanId, { status: AI_TRACE_STATUS.SUCCEEDED, candidateCount: referencingLinks.length, selectedEvidenceCount: snippets.length, contextCharacterCount: 0, durationMs: Date.now() - traceStartedAt });

    return {
      requestId,
      traceId,
      note: {
        title: parsed.title || title,
        content: parsed.content || "",
        links: parsed.links || [],
        tags: parsed.tags || [],
      },
    };
  } catch (err: any) {
    logger.error("Failed to parse LLM JSON response for bootstrap preview", err);
    await completeBootstrapTrace(db, traceId, requestSpanId, { status: AI_TRACE_STATUS.FAILED, candidateCount: referencingLinks.length, selectedEvidenceCount: snippets.length, contextCharacterCount: 0, durationMs: Date.now() - traceStartedAt, errorCode: "invalid_model_response" });
    throw new Error(`LLM did not return valid note JSON: ${err.message}`);
  }
}

async function completeBootstrapTrace(db: ReturnType<typeof createDbClient>["db"], traceId: string | null, requestSpanId: string | null, input: Parameters<typeof completeAiTrace>[2]) {
  if (!traceId) return;
  await completeAiTrace(db, traceId, input);
  if (requestSpanId) await completeAiTraceSpan(db, requestSpanId, { status: input.status, durationMs: input.durationMs, errorCode: input.errorCode, attributes: { source_count: input.selectedEvidenceCount } });
}
