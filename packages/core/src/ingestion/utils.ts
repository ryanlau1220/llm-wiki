import crypto from "node:crypto";
import path from "node:path";

export function normalizeMarkdownContent(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n").map((line) => line.replace(/\s+$/u, ""));
  return lines.join("\n");
}

export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function inferTitleFromPath(filePath: string): string {
  const base = path.basename(filePath);
  return base.replace(/\.md$/i, "") || base;
}

export function byteLength(content: string): number {
  return Buffer.byteLength(content, "utf8");
}
