import { asc, isNull, lt, or } from "drizzle-orm";

import { documents, type DbClient } from "@llm-wiki/db";
import type { QualityMetrics } from "@llm-wiki/types";

export type WeakNote = {
  id: string;
  path: string;
  title: string;
  qualityScore: number | null;
  reasons: string[];
};

export type WeakNotesRequest = {
  minQualityScore?: number;
  maxResults?: number;
};

const DEFAULT_MIN_QUALITY_SCORE = 0.55;
const DEFAULT_MAX_RESULTS = 50;

export async function getWeakNotes(
  db: DbClient,
  request: WeakNotesRequest = {}
): Promise<WeakNote[]> {
  const minQualityScore = request.minQualityScore ?? DEFAULT_MIN_QUALITY_SCORE;
  const maxResults = request.maxResults ?? DEFAULT_MAX_RESULTS;

  const rows = await db
    .select({
      id: documents.id,
      path: documents.path,
      title: documents.title,
      qualityScore: documents.quality_score,
      qualityMetrics: documents.quality_metrics
    })
    .from(documents)
    .where(or(isNull(documents.quality_score), lt(documents.quality_score, minQualityScore)))
    .orderBy(asc(documents.updated_at))
    .limit(maxResults);

  return rows.map((row) => ({
    id: row.id,
    path: row.path,
    title: row.title,
    qualityScore: row.qualityScore ?? null,
    reasons: inferReasons(row.qualityMetrics as QualityMetrics | null | undefined)
  }));
}

function inferReasons(metrics: QualityMetrics | null | undefined): string[] {
  if (!metrics) return ["missing_quality_metrics"];

  const reasons: string[] = [];
  if ((metrics.wordCount ?? 0) < 80) reasons.push("too_short");
  if ((metrics.completeness ?? 0) < 0.5) reasons.push("missing_metadata");
  if ((metrics.linkDensity ?? 0) < 0.02) reasons.push("low_link_density");
  if (typeof metrics.coherence === "number" && metrics.coherence < 0.55) reasons.push("low_coherence");
  if (!reasons.length) reasons.push("low_quality_score");
  return reasons;
}
