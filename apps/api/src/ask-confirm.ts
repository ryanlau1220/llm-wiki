import { promises as fs } from "node:fs";
import path from "node:path";

import { createDbClient } from "@llm-wiki/db";
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

  const parsed = aiActionEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: "rejected", error: parsed.error.message };
  }

  const { db } = createDbClient(config.databaseUrl);
  const vaultRoot = path.resolve(config.vaultPath, "..", "ai-generated");
  const safeSlug = slugify(note.title ?? "note");
  const filePath = path.join(vaultRoot, `${safeSlug}.md`);

  await fs.mkdir(vaultRoot, { recursive: true });
  await fs.writeFile(filePath, buildNoteFile(note), "utf8");

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
