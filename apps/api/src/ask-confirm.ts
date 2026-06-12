import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { desc, eq } from "drizzle-orm";

import { createEmbeddingProvider, createLLMProvider } from "@llm-wiki/ai";
import { actionAuditEvents, chunks, createDbClient, documents } from "@llm-wiki/db";
import { aiActionEnvelopeSchema } from "@llm-wiki/types";
import { ingestMarkdown } from "@llm-wiki/core";

import type { AppConfig } from "./config";
import { sseEmitter } from "./events";

export type AskNoteInput = {
  title?: string;
  content?: string;
  links?: string[];
  tags?: string[];
};

export type NoteFrontmatter = {
  type: "ai_generated" | "ai_refactored" | "ai_synthesized";
  source: "ask" | "refactor" | "synthesis";
  ai_status?: string;
  health_score?: number;
};

export type AskConfirmResult = {
  status: "saved" | "rejected";
  path?: string;
  error?: string;
};

const DEFAULT_SEMANTIC_DUPLICATE_THRESHOLD = 0.92;
const DEFAULT_SEMANTIC_CANDIDATE_LIMIT = 200;

export async function confirmAskSave(
  config: AppConfig,
  requestId: string,
  note: AskNoteInput,
  frontmatter: NoteFrontmatter = { type: "ai_generated", source: "ask" }
): Promise<AskConfirmResult> {
  if (!config.databaseUrl) {
    return { status: "rejected", error: "DATABASE_URL is required" };
  }

  const sanitizedTags = (note.tags || [])
    .map((tag) =>
      tag
        .replace(/\s+/g, "-")          // Replace spaces with hyphens
        .replace(/[^a-zA-Z0-9_-]/g, "") // Remove other invalid characters
        .slice(0, 50)                  // Limit to 50 characters max
    )
    .filter((tag) => tag.length > 0);

  const payload = {
    request_id: requestId,
    action: "create_note",
    dry_run: false,
    payload: {
      title: note.title ?? "",
      content: note.content ?? "",
      links: note.links,
      tags: sanitizedTags,
      source: frontmatter.source
    },
    reason: "user_confirmed"
  };

  const { db } = createDbClient(config.databaseUrl);
  const parsed = aiActionEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    await recordAudit(db, requestId, "create_note", "rejected", parsed.error.message);
    return { status: "rejected", error: parsed.error.message };
  }

  const exactDuplicate = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.content_hash, hashContent(note.content ?? "")))
    .limit(1);

  if (exactDuplicate.length) {
    await recordAudit(db, requestId, "create_note", "rejected", "duplicate_content");
    return { status: "rejected", error: "duplicate_content" };
  }

  // Synthesized notes are summaries of existing notes and will naturally have high semantic similarity
  // to their source documents. Therefore, we bypass the semantic duplication check for them.
  const isSynthesis = frontmatter.source === "synthesis";
  if (!isSynthesis) {
    const semanticDuplicate = await hasSemanticDuplicate(config, db, note.content ?? "");
    if (semanticDuplicate) {
      await recordAudit(db, requestId, "create_note", "rejected", "duplicate_semantic");
      return { status: "rejected", error: "duplicate_semantic" };
    }
  }
  const vaultRoot = path.resolve(config.vaultPath);
  const safeSlug = slugify(note.title ?? "note");
  await fs.mkdir(vaultRoot, { recursive: true });
  const filePath = await resolveUniquePath(vaultRoot, safeSlug);

  const noteContent = buildNoteFile({ ...note, tags: sanitizedTags }, frontmatter);
  await fs.writeFile(filePath, noteContent, "utf8");

  // Ingest the note immediately into the database
  try {
    const embeddingProvider = createEmbeddingProvider({
      provider: config.embeddingProvider,
      geminiGeap: {
        projectId: config.gcpProjectId,
        location: config.gcpLocation,
        model: config.gcpEmbeddingModel
      },
      ollama: {
        baseUrl: config.ollamaBaseUrl,
        model: config.ollamaEmbeddingModel
      },
      openai: {
        apiKey: config.openaiApiKey,
        baseUrl: config.openaiBaseUrl,
        model: config.openaiEmbeddingModel
      }
    });

    const llmProvider = createLLMProvider({
      provider: config.embeddingProvider as any,
      geminiGeap: {
        projectId: config.gcpProjectId,
        location: config.gcpLocation,
        model: config.gcpLlmModel
      },
      ollama: {
        baseUrl: config.ollamaBaseUrl,
        model: config.ollamaLlmModel
      },
      openai: {
        apiKey: config.openaiApiKey,
        baseUrl: config.openaiBaseUrl,
        model: config.openaiLlmModel
      }
    });

    const relativePath = path.relative(path.resolve(config.vaultPath), filePath).replace(/\\/g, "/");

    await ingestMarkdown(
      {
        db,
        options: {
          embeddingProvider,
          llmProvider,
          embeddingVersion: config.embeddingVersion
        }
      },
      {
        vaultPath: relativePath,
        rawContent: noteContent,
        sourceKind: "ai",
        isAiGenerated: true
      }
    );
    sseEmitter.emit("change", { type: "note_changed", path: relativePath });
  } catch (ingestError: any) {
    console.error(`Failed to ingest saved AI note: ${filePath}`, ingestError);
  }

  await recordAudit(db, requestId, "create_note", "accepted", undefined, {
    path: filePath
  });

  return {
    status: "saved",
    path: filePath
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80) || "note";
}

function buildNoteFile(note: AskNoteInput, frontmatter: NoteFrontmatter): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`type: ${frontmatter.type}`);
  lines.push(`source: ${frontmatter.source}`);
  lines.push(`ai_status: ${frontmatter.ai_status ?? "clean"}`);
  lines.push(`health_score: ${frontmatter.health_score ?? 1.0}`);
  lines.push(`created_at: ${new Date().toISOString()}`);
  if (note.tags?.length) {
    lines.push(`tags: [${note.tags.map((tag) => `"${tag}"`).join(", ")}]`);
  }
  lines.push("---");
  lines.push("");
  lines.push(`# ${note.title ?? ""}`);
  lines.push("");
  lines.push(note.content ?? "");

  // Append related concepts as Obsidian wikilinks if they aren't already linked inside the content
  if (note.links?.length && !note.content?.includes("[[")) {
    // Check if the content already has a "Related Concepts" header
    const hasRelatedHeader = /##\s+Related\s+Concepts/i.test(note.content ?? "");
    if (!hasRelatedHeader) {
      lines.push("");
      lines.push("## Related Concepts");
    } else {
      lines.push("");
    }
    for (const link of note.links) {
      lines.push(`* [[${link}]]`);
    }
  }

  return lines.join("\n");
}

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function resolveUniquePath(root: string, slug: string): Promise<string> {
  let candidate = path.join(root, `${slug}.md`);
  let counter = 1;

  while (await exists(candidate)) {
    candidate = path.join(root, `${slug}-${counter}.md`);
    counter += 1;
  }

  return candidate;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function recordAudit(
  db: ReturnType<typeof createDbClient>["db"],
  requestId: string,
  action: string,
  result: "accepted" | "rejected",
  rejectionReason?: string,
  metadata: Record<string, unknown> = {}
) {
  await db.insert(actionAuditEvents).values({
    request_id: requestId,
    action,
    validation_result: result,
    rejection_reason: rejectionReason,
    actor: "user",
    metadata,
    created_at: new Date()
  });
}

async function hasSemanticDuplicate(
  config: AppConfig,
  db: ReturnType<typeof createDbClient>["db"],
  content: string
): Promise<boolean> {
  if (!content.trim()) {
    return false;
  }

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

  const embeddingResult = await embeddingProvider.embed({ texts: [content] });
  const queryVector = embeddingResult.vectors[0];
  if (!queryVector?.length) {
    return false;
  }

  const candidates = await db
    .select({ embedding: chunks.embedding })
    .from(chunks)
    .orderBy(desc(chunks.updated_at))
    .limit(resolveCandidateLimit(config));

  for (const candidate of candidates) {
    const vector = candidate.embedding;
    if (vector.length !== queryVector.length) {
      continue;
    }

    const similarity = cosineSimilarity(queryVector, vector);
    if (similarity >= resolveThreshold(config)) {
      return true;
    }
  }

  return false;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (!normA || !normB) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function resolveThreshold(config: AppConfig): number {
  if (Number.isFinite(config.semanticDuplicateThreshold)) {
    return config.semanticDuplicateThreshold;
  }

  return DEFAULT_SEMANTIC_DUPLICATE_THRESHOLD;
}

function resolveCandidateLimit(config: AppConfig): number {
  if (Number.isFinite(config.semanticDuplicateCandidates)) {
    return config.semanticDuplicateCandidates;
  }

  return DEFAULT_SEMANTIC_CANDIDATE_LIMIT;
}
