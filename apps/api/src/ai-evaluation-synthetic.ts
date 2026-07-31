import { chunks, documents, type createDbClient } from "@llm-wiki/db";
import { asc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";

const MAX_CASES = 12;
const SOURCE_SCAN_MULTIPLIER = 8;

export type GeneratedBaselineCase = {
  label: string;
  redactedInput: string;
  expectedEvidence: Array<{ documentPath: string; chunkIndex: number }>;
  expectedOutcome: string;
  generationMetadata: {
    generator: "deterministic_indexed_evidence";
    sourceCount: number;
    corpusFingerprint: string;
  };
};

export type GeneratedBaselineSuite = {
  cases: GeneratedBaselineCase[];
  /** Hashes document identity and indexed content hashes, never source text. */
  corpusFingerprint: string;
};

type SourceItem = { documentPath: string; chunkIndex: number; contentHash?: string };

/**
 * Builds a repeatable retrieval baseline from the indexed vault without
 * calling an LLM or retaining vault text. Each probe names a note and expects
 * its first indexed chunk, so retrieval regressions are observable on a fresh
 * installation even when no evaluator model is installed.
 */
export async function generateDeterministicBaselineSuite(
  db: ReturnType<typeof createDbClient>["db"],
  maxCases: number,
): Promise<GeneratedBaselineSuite> {
  if (!Number.isInteger(maxCases) || maxCases < 1 || maxCases > MAX_CASES) {
    throw new Error(`Generate between 1 and ${MAX_CASES} baseline cases`);
  }

  const sources = await loadDistinctSourceItems(db, maxCases);
  if (!sources.length) throw new Error("Index Vault notes before running an evaluation");

  return buildDeterministicBaselineSuite(sources);
}

/** Pure builder kept separate so stable probe generation is directly testable. */
export function buildDeterministicBaselineCases(sources: SourceItem[]): GeneratedBaselineCase[] {
  return buildDeterministicBaselineSuite(sources).cases;
}

/** Builds a deterministic retrieval baseline from indexed source identities. */
export function buildDeterministicBaselineSuite(sources: SourceItem[]): GeneratedBaselineSuite {
  const corpusFingerprint = fingerprintSources(sources);
  const cases: GeneratedBaselineCase[] = sources.map((source) => {
    const title = toReadableTitle(source.documentPath);
    const question = `What does ${title} cover?`;
    return {
      label: `Indexed note: ${title}`,
      redactedInput: question,
      expectedEvidence: [{ documentPath: source.documentPath, chunkIndex: source.chunkIndex }],
      expectedOutcome: "Provide a grounded answer using the selected indexed note.",
      generationMetadata: {
        generator: "deterministic_indexed_evidence" as const,
        sourceCount: sources.length,
        corpusFingerprint,
      },
    };
  });
  return { cases, corpusFingerprint };
}

async function loadDistinctSourceItems(
  db: ReturnType<typeof createDbClient>["db"],
  maxCases: number,
): Promise<SourceItem[]> {
  const rows = await db
    .select({
      documentPath: documents.path,
      chunkIndex: chunks.chunk_index,
      text: chunks.text,
      contentHash: documents.content_hash,
    })
    .from(chunks)
    .innerJoin(documents, eq(chunks.document_id, documents.id))
    .orderBy(asc(documents.path), asc(chunks.chunk_index))
    .limit(maxCases * SOURCE_SCAN_MULTIPLIER);

  const seenPaths = new Set<string>();
  const sources: SourceItem[] = [];
  for (const row of rows) {
    if (!row.text.trim() || seenPaths.has(row.documentPath)) continue;
    seenPaths.add(row.documentPath);
    sources.push({
      documentPath: row.documentPath,
      chunkIndex: row.chunkIndex,
      contentHash: row.contentHash,
    });
    if (sources.length === maxCases) break;
  }
  return sources;
}

function fingerprintSources(sources: SourceItem[]): string {
  const sourceIdentity = sources
    .map(
      (source) =>
        `${source.documentPath}\u0000${source.chunkIndex}\u0000${source.contentHash ?? ""}`,
    )
    .join("\n");
  return createHash("sha256").update(sourceIdentity).digest("hex");
}

function toReadableTitle(documentPath: string): string {
  const filename = documentPath.split("/").at(-1) ?? documentPath;
  const withoutExtension = filename.replace(/\.[a-z0-9]+$/i, "");
  return withoutExtension.replaceAll(/[-_]+/g, " ").trim() || documentPath;
}
