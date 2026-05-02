import crypto from "node:crypto";
import path from "node:path";
import type { QualityMetrics } from "@llm-wiki/types";

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

export function calculateAggregateScore(metrics: QualityMetrics): number {
  const weights = {
    linkDensity: 0.4,
    completeness: 0.3,
    coherence: 0.3,
  };

  let totalWeight = weights.linkDensity + weights.completeness;
  let score = (metrics.linkDensity * weights.linkDensity) + (metrics.completeness * weights.completeness);

  if (metrics.coherence !== undefined) {
    totalWeight += weights.coherence;
    score += (metrics.coherence * weights.coherence);
  }

  return score / totalWeight;
}
