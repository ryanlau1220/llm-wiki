import crypto from "node:crypto";
import { sql, inArray } from "drizzle-orm";

import { createLLMProvider } from "@llm-wiki/ai";
import { createDbClient, documents, links } from "@llm-wiki/db";
import { createLogger } from "@llm-wiki/core";

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
}> {
  const logger = createLogger("bootstrapper");
  logger.info("Generating bootstrap note preview", { title });

  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required to generate bootstrap preview");
  }

  const { db } = createDbClient(config.databaseUrl);

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
  const llmResponse = await llmProvider.generate({
    prompt,
    systemInstruction,
    responseMimeType: "application/json",
    temperature: 0.2,
  } as any);
  const duration = Date.now() - startTime;

  try {
    const parsed = JSON.parse(llmResponse.text);
    const requestId = crypto.randomUUID();

    logger.info("Bootstrap preview generated successfully", {
      requestId,
      durationMs: duration,
    });

    return {
      requestId,
      note: {
        title: parsed.title || title,
        content: parsed.content || "",
        links: parsed.links || [],
        tags: parsed.tags || [],
      },
    };
  } catch (err: any) {
    logger.error("Failed to parse LLM JSON response for bootstrap preview", err);
    throw new Error(`LLM did not return valid note JSON: ${err.message}`);
  }
}
