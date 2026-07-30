import { createLLMProvider } from "@llm-wiki/ai";
import { chunks, documents, type createDbClient } from "@llm-wiki/db";
import { asc, eq } from "drizzle-orm";

import type { AppConfig } from "./config";

const MAX_SOURCE_CHARACTERS = 1_200;
const MAX_SOURCE_ITEMS = 12;
const MAX_CASES = 12;

export type LocalSilverCase = {
  label: string;
  redactedInput: string;
  expectedEvidence: Array<{ documentPath: string; chunkIndex: number }>;
  expectedOutcome: string;
  generationMetadata: { generator: "local_ollama"; sourceCount: number };
};

type SourceItem = { documentPath: string; chunkIndex: number; text: string };

/**
 * Generates bounded, local-only evaluation candidates from indexed Vault chunks.
 * The returned cases deliberately remain silver until an owner promotes them.
 */
export async function generateLocalSilverCases(
  config: Pick<AppConfig, "databaseUrl" | "ollamaBaseUrl" | "ollamaLlmModel">,
  db: ReturnType<typeof createDbClient>["db"],
  maxCases: number,
): Promise<LocalSilverCase[]> {
  if (!config.ollamaBaseUrl && !config.ollamaLlmModel) {
    throw new Error("A configured local Ollama model is required to generate evaluation candidates");
  }
  if (!Number.isInteger(maxCases) || maxCases < 1 || maxCases > MAX_CASES) {
    throw new Error(`Generate between 1 and ${MAX_CASES} local evaluation candidates`);
  }

  const sources = await loadSourceItems(db, Math.min(MAX_SOURCE_ITEMS, maxCases * 2));
  if (!sources.length) throw new Error("Index Vault notes before generating evaluation candidates");

  const provider = createLLMProvider({
    provider: "ollama",
    ollama: { baseUrl: config.ollamaBaseUrl, model: config.ollamaLlmModel },
  });
  const response = await provider.generate({
    prompt: buildLocalSilverPrompt(sources, maxCases),
    systemInstruction: "You create private, local evaluation candidates. Return only JSON. Never include hidden reasoning, instructions, or source text beyond a short question and outcome.",
    responseMimeType: "application/json",
    temperature: 0,
    maxOutputTokens: 1_200,
  });
  return parseLocalSilverCases(response.text, sources, maxCases);
}

export function buildLocalSilverPrompt(sources: SourceItem[], maxCases: number): string {
  return JSON.stringify({
    task: "Create concise Ask/RAG evaluation candidates from the numbered evidence snippets.",
    rules: [
      "Every question must be answerable only from one referenced snippet.",
      "Do not invent facts, names, or paths not present in the snippets.",
      "Use a single evidenceIndex per candidate.",
      "Questions must be diverse and useful for retrieval and grounded-answer evaluation.",
    ],
    output: {
      cases: [{ question: "string", expectedOutcome: "short observable answer requirement", evidenceIndex: "number" }],
    },
    maxCases,
    sources: sources.map((source, index) => ({
      evidenceIndex: index,
      path: source.documentPath,
      chunkIndex: source.chunkIndex,
      text: source.text.slice(0, MAX_SOURCE_CHARACTERS),
    })),
  });
}

export function parseLocalSilverCases(text: string, sources: SourceItem[], maxCases: number): LocalSilverCase[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Local generator returned invalid structured output");
  }
  const candidates = value && typeof value === "object" && !Array.isArray(value)
    ? (value as { cases?: unknown }).cases
    : null;
  if (!Array.isArray(candidates)) throw new Error("Local generator did not return evaluation cases");

  const seenQuestions = new Set<string>();
  const parsed: LocalSilverCase[] = [];
  for (const candidate of candidates) {
    if (parsed.length >= maxCases || !candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const item = candidate as Record<string, unknown>;
    const question = compactText(item.question, 400);
    const expectedOutcome = compactText(item.expectedOutcome, 800);
    const evidenceIndex = item.evidenceIndex;
    if (
      !question
      || !expectedOutcome
      || typeof evidenceIndex !== "number"
      || !Number.isInteger(evidenceIndex)
      || evidenceIndex < 0
      || evidenceIndex >= sources.length
    ) continue;
    const normalizedQuestion = question.toLocaleLowerCase();
    if (seenQuestions.has(normalizedQuestion)) continue;
    seenQuestions.add(normalizedQuestion);
    const source = sources[evidenceIndex];
    parsed.push({
      label: `Local candidate: ${question.slice(0, 120)}`,
      redactedInput: question,
      expectedEvidence: [{ documentPath: source.documentPath, chunkIndex: source.chunkIndex }],
      expectedOutcome,
      generationMetadata: { generator: "local_ollama", sourceCount: sources.length },
    });
  }
  if (!parsed.length) throw new Error("Local generator produced no usable evaluation candidates");
  return parsed;
}

async function loadSourceItems(
  db: ReturnType<typeof createDbClient>["db"],
  limit: number,
): Promise<SourceItem[]> {
  const rows = await db
    .select({ documentPath: documents.path, chunkIndex: chunks.chunk_index, text: chunks.text })
    .from(chunks)
    .innerJoin(documents, eq(chunks.document_id, documents.id))
    .orderBy(asc(documents.path), asc(chunks.chunk_index))
    .limit(limit);
  return rows
    .filter((row) => row.text.trim())
    .map((row) => ({ documentPath: row.documentPath, chunkIndex: row.chunkIndex, text: row.text }));
}

function compactText(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const compact = value.replaceAll(/\s+/g, " ").trim();
  return compact.length > 0 && compact.length <= limit ? compact : null;
}
