import { rankOrganizationSuggestions, type OrganizationNoteSignals, type OrganizationSuggestion } from "@llm-wiki/core";
import { createDbClient, documents, links } from "@llm-wiki/db";
import {
  qualityMetricsSchema,
  type ListOrganizationSuggestionsInput,
} from "@llm-wiki/types";

import type { AppConfig } from "./config";

const DEFAULT_MAX_RESULTS = 50;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

type LinkCounts = {
  unresolved: number;
};

export async function listOrganizationSuggestions(
  config: Pick<AppConfig, "databaseUrl">,
  input: ListOrganizationSuggestionsInput = undefined,
  now: Date = new Date(),
): Promise<OrganizationSuggestion[]> {
  const databaseUrl = requireDatabase(config);
  const { db } = createDbClient(databaseUrl);
  const [noteRows, linkRows] = await Promise.all([
    db.select({
      id: documents.id,
      path: documents.path,
      title: documents.title,
      content: documents.content,
      qualityScore: documents.quality_score,
      qualityMetrics: documents.quality_metrics,
      healthScore: documents.health_score,
      updatedAt: documents.updated_at,
    }).from(documents),
    db.select({
      sourceDocumentId: links.source_document_id,
      isResolved: links.is_resolved,
    }).from(links),
  ]);

  const linkCountsByDocumentId = countUnresolvedLinks(linkRows);
  const signals = noteRows.map((note) => toOrganizationNoteSignals(
    note,
    linkCountsByDocumentId.get(note.id),
    now,
  ));

  return rankOrganizationSuggestions(signals).slice(0, input?.maxResults ?? DEFAULT_MAX_RESULTS);
}

function requireDatabase(config: Pick<AppConfig, "databaseUrl">): string {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required for organization suggestions");
  }
  return config.databaseUrl;
}

function countUnresolvedLinks(
  links: readonly { sourceDocumentId: string; isResolved: boolean }[],
): Map<string, LinkCounts> {
  const counts = new Map<string, LinkCounts>();
  for (const link of links) {
    if (link.isResolved) continue;

    const current = counts.get(link.sourceDocumentId) ?? { unresolved: 0 };
    current.unresolved += 1;
    counts.set(link.sourceDocumentId, current);
  }
  return counts;
}

function toOrganizationNoteSignals(
  note: {
    id: string;
    path: string;
    title: string;
    content: string;
    qualityScore: number | null;
    qualityMetrics: unknown;
    healthScore: number | null;
    updatedAt: Date;
  },
  linkCounts: LinkCounts | undefined,
  now: Date,
): OrganizationNoteSignals {
  const metricsResult = qualityMetricsSchema.safeParse(note.qualityMetrics);
  const metrics = metricsResult.success ? metricsResult.data : undefined;

  return {
    id: note.id,
    path: note.path,
    title: note.title,
    qualityScore: unitIntervalOrNull(note.qualityScore),
    healthScore: unitIntervalOrNull(note.healthScore),
    wordCount: metrics?.wordCount ?? countWords(note.content),
    completeness: metrics?.completeness ?? null,
    linkDensity: metrics?.linkDensity ?? null,
    unresolvedLinkCount: linkCounts?.unresolved ?? 0,
    staleDays: daysSince(note.updatedAt, now),
  };
}

function unitIntervalOrNull(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0 || value > 1) {
    return null;
  }
  return value;
}

function countWords(content: string): number {
  const trimmedContent = content.trim();
  return trimmedContent ? trimmedContent.split(/\s+/).length : 0;
}

function daysSince(updatedAt: Date, now: Date): number {
  const elapsedMilliseconds = Math.max(0, now.getTime() - updatedAt.getTime());
  return Math.floor(elapsedMilliseconds / MILLISECONDS_PER_DAY);
}
