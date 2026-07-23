import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";

import {
  createDbClient,
  documents,
  extensionDevices,
  extensionPairingCodes,
  researchCaptures,
} from "@llm-wiki/db";
import {
  type ApproveResearchCapture,
  type ExtensionResearchCapture,
  type MergeResearchCapture,
  RESEARCH_CAPTURE_STATUS,
  type ResearchCaptureStatus,
} from "@llm-wiki/types";
import type { AppConfig } from "./config";
import { canonicalizeCaptureSources, canonicalizeCaptureUrl } from "./capture-url-normalization";
import { sseEmitter } from "./events";
import { reindexFile } from "./reindex";

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_RESEARCH_CAPTURE_FOLDER = "research";
const DEFAULT_CAPTURE_DEPENDENCIES = {
  reindex: reindexFile,
};

type ResearchCaptureDependencies = {
  reindex: typeof reindexFile;
};

export class ExtensionPairingError extends Error {}
export class ExtensionAuthenticationError extends Error {}

export function hashSecret(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createPairingCode(): string {
  // Human-enterable, but still 80 bits of entropy. Hyphens make it easier to
  // verify across the dashboard and extension without weakening the code.
  return crypto.randomBytes(10).toString("hex").toUpperCase().match(/.{1,4}/g)!.join("-");
}

function createDeviceToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function requireDatabase(config: AppConfig): string {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required for research capture");
  }
  return config.databaseUrl;
}

type DuplicateCandidate = {
  captureId: string;
  title: string;
  path: string | null;
};

function formatCapture(
  capture: typeof researchCaptures.$inferSelect,
  duplicateCandidates: DuplicateCandidate[] = [],
) {
  const sources = Array.isArray(capture.sources) ? capture.sources : [];
  return {
    id: capture.id,
    sourceUrl: capture.source_url,
    sourceTitle: capture.source_title,
    query: capture.query,
    content: capture.content,
    sources: sources.flatMap((source) => {
      if (
        source &&
        typeof source === "object" &&
        "title" in source &&
        "url" in source &&
        typeof source.title === "string" &&
        typeof source.url === "string"
      ) {
        return [{ title: source.title, url: source.url }];
      }
      return [];
    }),
    duplicateCandidates,
    status: capture.status as ResearchCaptureStatus,
    savedDocumentId: capture.saved_document_id,
    savedPath: capture.saved_path,
    capturedAt: capture.captured_at.toISOString(),
    reviewedAt: capture.reviewed_at?.toISOString() ?? null,
    createdAt: capture.created_at.toISOString(),
  };
}

export async function createExtensionPairingCodeForDashboard(config: AppConfig) {
  const { db } = createDbClient(requireDatabase(config));
  const code = createPairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);

  await db.insert(extensionPairingCodes).values({
    code_hash: hashSecret(code),
    expires_at: expiresAt,
  });

  return { code, expiresAt: expiresAt.toISOString() };
}

export async function pairExtension(config: AppConfig, pairingCode: string, name: string) {
  const { db } = createDbClient(requireDatabase(config));
  const now = new Date();
  const normalizedCode = pairingCode.trim().toUpperCase();
  // Consume first with a conditional update. This makes the one-time property
  // atomic even if two browser windows submit the same code at once.
  const consumed = await db
    .update(extensionPairingCodes)
    .set({ consumed_at: now })
    .where(
      and(
        eq(extensionPairingCodes.code_hash, hashSecret(normalizedCode)),
        gt(extensionPairingCodes.expires_at, now),
        isNull(extensionPairingCodes.consumed_at)
      )
    )
    .returning({ id: extensionPairingCodes.id });
  if (!consumed.length) {
    throw new ExtensionPairingError("The pairing code is invalid, expired, or was already used");
  }

  const token = createDeviceToken();
  const [device] = await db
    .insert(extensionDevices)
    .values({
      name: name.trim().slice(0, 120) || "Desktop browser",
      token_hash: hashSecret(token),
    })
    .returning({ id: extensionDevices.id });

  return { deviceId: device!.id, token };
}

export async function createResearchCapture(
  config: AppConfig,
  token: string,
  input: ExtensionResearchCapture,
) {
  const { db } = createDbClient(requireDatabase(config));
  const [device] = await db
    .select()
    .from(extensionDevices)
    .where(and(eq(extensionDevices.token_hash, hashSecret(token)), isNull(extensionDevices.revoked_at)))
    .limit(1);

  if (!device) {
    throw new ExtensionAuthenticationError("This extension is not paired with LLM Wiki");
  }

  const capturedAt = new Date(input.capturedAt);
  const sourceUrl = canonicalizeCaptureUrl(input.sourceUrl);
  const sources = canonicalizeCaptureSources(input.sources);
  const [capture] = await db
    .insert(researchCaptures)
    .values({
      extension_device_id: device.id,
      source_url: sourceUrl,
      source_title: input.sourceTitle,
      query: input.query || null,
      content: input.content,
      sources,
      captured_at: capturedAt,
    })
    .returning({ id: researchCaptures.id, status: researchCaptures.status });

  await db
    .update(extensionDevices)
    .set({ last_used_at: new Date() })
    .where(eq(extensionDevices.id, device.id));

  sseEmitter.emit("change", { type: "research_capture_changed", id: capture!.id });
  return { id: capture!.id, status: capture!.status };
}

export async function listResearchCaptureInbox(
  config: AppConfig,
  status: ResearchCaptureStatus | "all" = RESEARCH_CAPTURE_STATUS.INBOX,
) {
  const { db } = createDbClient(requireDatabase(config));
  const results = status === "all"
    ? await db.select().from(researchCaptures).orderBy(desc(researchCaptures.captured_at))
    : await db
        .select()
        .from(researchCaptures)
        .where(eq(researchCaptures.status, status))
        .orderBy(desc(researchCaptures.captured_at));

  const sourceUrls = [...new Set(results.map((capture) => capture.source_url))];
  const savedCaptures = sourceUrls.length
    ? await db
        .select({
          id: researchCaptures.id,
          sourceUrl: researchCaptures.source_url,
          title: researchCaptures.source_title,
          path: researchCaptures.saved_path,
        })
        .from(researchCaptures)
        .where(and(
          eq(researchCaptures.status, RESEARCH_CAPTURE_STATUS.APPROVED),
          inArray(researchCaptures.source_url, sourceUrls),
        ))
    : [];
  const duplicatesBySourceUrl = new Map<string, DuplicateCandidate[]>();
  for (const savedCapture of savedCaptures) {
    const duplicates = duplicatesBySourceUrl.get(savedCapture.sourceUrl) ?? [];
    duplicates.push({ captureId: savedCapture.id, title: savedCapture.title, path: savedCapture.path });
    duplicatesBySourceUrl.set(savedCapture.sourceUrl, duplicates);
  }

  return results.map((capture) => formatCapture(
    capture,
    (duplicatesBySourceUrl.get(capture.source_url) ?? []).filter((candidate) => candidate.captureId !== capture.id),
  ));
}

function vaultRelativePath(vaultRoot: string, filePath: string): string {
  const relative = path.relative(vaultRoot, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Research capture path must remain inside the vault");
  }
  return relative.replace(/\\/g, "/");
}

function captureDestinationPath(vaultRoot: string, destinationFolder: string | undefined): string {
  const folder = destinationFolder ?? DEFAULT_RESEARCH_CAPTURE_FOLDER;
  const destinationPath = path.resolve(vaultRoot, folder);
  const relative = path.relative(vaultRoot, destinationPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Research capture destination must remain inside the vault");
  }
  return destinationPath;
}

function slugify(value: string): string {
  return value
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "research-capture";
}

function yamlQuote(value: string): string {
  return JSON.stringify(value);
}

function markdownLabel(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/([\\[\]])/g, "\\$1")
    .trim();
}

export function buildResearchMarkdown(input: {
  captureId: string;
  title: string;
  sourceUrl: string;
  sourceTitle: string;
  query: string | null;
  content: string;
  sources: Array<{ title: string; url: string }>;
  capturedAt: Date;
  tags?: string[];
}): string {
  const tags = (input.tags ?? [])
    .map((tag) => tag.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 50))
    .filter(Boolean);
  const lines = [
    "---",
    "type: research_capture",
    "source_kind: browser_capture",
    `capture_id: ${yamlQuote(input.captureId)}`,
    `captured_at: ${yamlQuote(input.capturedAt.toISOString())}`,
    `source_url: ${yamlQuote(input.sourceUrl)}`,
    `source_title: ${yamlQuote(input.sourceTitle)}`,
  ];
  if (tags.length) lines.push(`tags: [${tags.map(yamlQuote).join(", ")}]`);
  lines.push("---", "", `# ${markdownLabel(input.title)}`, "");
  if (input.query) lines.push("## Research question", "", input.query, "");
  lines.push("## Captured response", "", input.content.trim(), "", "## Provenance", "");
  lines.push(`- Captured from [${markdownLabel(input.sourceTitle)}](${input.sourceUrl}) on ${input.capturedAt.toISOString()}.`);
  for (const source of input.sources) {
    lines.push(`- [${markdownLabel(source.title)}](${source.url})`);
  }
  return lines.join("\n");
}

async function getInboxCapture(config: AppConfig, id: string) {
  const { db } = createDbClient(requireDatabase(config));
  const [capture] = await db
    .select()
    .from(researchCaptures)
    .where(and(eq(researchCaptures.id, id), eq(researchCaptures.status, RESEARCH_CAPTURE_STATUS.INBOX)))
    .limit(1);
  if (!capture) throw new Error("Research capture is no longer in the inbox");
  return { db, capture };
}

export async function approveResearchCapture(
  config: AppConfig,
  input: ApproveResearchCapture,
  dependencies: ResearchCaptureDependencies = DEFAULT_CAPTURE_DEPENDENCIES,
) {
  const { db, capture } = await getInboxCapture(config, input.id);
  const vaultRoot = path.resolve(config.vaultPath);
  const researchDir = captureDestinationPath(vaultRoot, input.destinationFolder);
  const filePath = path.resolve(researchDir, `${capture.id}-${slugify(input.title || capture.source_title)}.md`);
  const relativePath = vaultRelativePath(vaultRoot, filePath);
  const sources = formatCapture(capture).sources;
  const content = buildResearchMarkdown({
    captureId: capture.id,
    title: input.title || capture.source_title,
    sourceUrl: capture.source_url,
    sourceTitle: capture.source_title,
    query: capture.query,
    content: capture.content,
    sources,
    capturedAt: capture.captured_at,
    tags: input.tags,
  });

  await fs.mkdir(researchDir, { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  const indexed = await dependencies.reindex(config, relativePath);
  if (indexed.status === "failed") {
    throw new Error(indexed.error || "The note was written but could not be indexed");
  }

  await db
    .update(researchCaptures)
    .set({
      status: RESEARCH_CAPTURE_STATUS.APPROVED,
      reviewed_at: new Date(),
      saved_document_id: indexed.documentId ?? null,
      saved_path: relativePath,
      updated_at: new Date(),
    })
    .where(eq(researchCaptures.id, capture.id));
  sseEmitter.emit("change", { type: "research_capture_changed", id: capture.id });

  return { status: RESEARCH_CAPTURE_STATUS.APPROVED, path: relativePath, documentId: indexed.documentId ?? null };
}

export async function mergeResearchCapture(
  config: AppConfig,
  input: MergeResearchCapture,
  dependencies: ResearchCaptureDependencies = DEFAULT_CAPTURE_DEPENDENCIES,
) {
  const { db, capture } = await getInboxCapture(config, input.id);
  const [target] = await db
    .select({ id: documents.id, path: documents.path })
    .from(documents)
    .where(eq(documents.id, input.targetDocumentId))
    .limit(1);
  if (!target) throw new Error("The selected vault note no longer exists");

  const vaultRoot = path.resolve(config.vaultPath);
  const targetPath = path.resolve(vaultRoot, target.path);
  const relativePath = vaultRelativePath(vaultRoot, targetPath);
  const original = await fs.readFile(targetPath, "utf8");
  const backupDir = path.resolve(vaultRoot, ".llm-wiki", "backups", "research-merge");
  await fs.mkdir(backupDir, { recursive: true });
  await fs.writeFile(path.join(backupDir, `${capture.id}-${Date.now()}.md`), original, "utf8");

  const sources = formatCapture(capture).sources;
  const excerpt = buildResearchMarkdown({
    captureId: capture.id,
    title: capture.source_title,
    sourceUrl: capture.source_url,
    sourceTitle: capture.source_title,
    query: capture.query,
    content: capture.content,
    sources,
    capturedAt: capture.captured_at,
  })
    .replace(/^---[\s\S]*?---\n\n/, "")
    .replace(/^# .*\n\n/, "");
  await fs.writeFile(targetPath, `${original.trimEnd()}\n\n---\n\n## Research capture: ${markdownLabel(capture.source_title)}\n\n${excerpt}\n`, "utf8");

  const indexed = await dependencies.reindex(config, relativePath);
  if (indexed.status === "failed") {
    throw new Error(indexed.error || "The note was updated but could not be indexed");
  }

  await db
    .update(researchCaptures)
    .set({
      status: RESEARCH_CAPTURE_STATUS.MERGED,
      reviewed_at: new Date(),
      saved_document_id: target.id,
      saved_path: relativePath,
      updated_at: new Date(),
    })
    .where(eq(researchCaptures.id, capture.id));
  sseEmitter.emit("change", { type: "research_capture_changed", id: capture.id });

  return { status: RESEARCH_CAPTURE_STATUS.MERGED, path: relativePath, documentId: target.id };
}

export async function discardResearchCapture(config: AppConfig, id: string) {
  const { db, capture } = await getInboxCapture(config, id);
  await db
    .update(researchCaptures)
    .set({ status: RESEARCH_CAPTURE_STATUS.DISCARDED, reviewed_at: new Date(), updated_at: new Date() })
    .where(eq(researchCaptures.id, capture.id));
  sseEmitter.emit("change", { type: "research_capture_changed", id: capture.id });
  return { status: RESEARCH_CAPTURE_STATUS.DISCARDED };
}
