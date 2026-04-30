import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { eq } from "drizzle-orm";

import { actionAuditEvents, createDbClient } from "@llm-wiki/db";
import { aiActionEnvelopeSchema } from "@llm-wiki/types";

import type { AppConfig } from "./config";

export type AskNoteInput = {
  title?: string;
  content?: string;
  links?: string[];
  tags?: string[];
};

export type AskConfirmResult = {
  status: "saved" | "rejected";
  path?: string;
  error?: string;
};

export async function confirmAskSave(
  config: AppConfig,
  requestId: string,
  note: AskNoteInput
): Promise<AskConfirmResult> {
  if (!config.databaseUrl) {
    return { status: "rejected", error: "DATABASE_URL is required" };
  }

  const payload = {
    request_id: requestId,
    action: "create_note",
    dry_run: false,
    payload: {
      title: note.title ?? "",
      content: note.content ?? "",
      links: note.links,
      tags: note.tags,
      source: "ask"
    },
    reason: "user_confirmed"
  };

  const { db } = createDbClient(config.databaseUrl);
  const parsed = aiActionEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    await recordAudit(db, requestId, "create_note", "rejected", parsed.error.message);
    return { status: "rejected", error: parsed.error.message };
  }
  const vaultRoot = path.resolve(config.vaultPath, "..", "ai-generated");
  const safeSlug = slugify(note.title ?? "note");
  await fs.mkdir(vaultRoot, { recursive: true });
  const filePath = await resolveUniquePath(vaultRoot, safeSlug);

  await fs.writeFile(filePath, buildNoteFile(note), "utf8");

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

function buildNoteFile(note: AskNoteInput): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push("type: ai_generated");
  lines.push("source: ask");
  lines.push(`created_at: ${new Date().toISOString()}`);
  if (note.tags?.length) {
    lines.push(`tags: [${note.tags.map((tag) => `\"${tag}\"`).join(", ")}]`);
  }
  lines.push("---");
  lines.push("");
  lines.push(`# ${note.title ?? ""}`);
  lines.push("");
  lines.push(note.content ?? "");
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
