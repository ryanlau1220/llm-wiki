import crypto from "node:crypto";

import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";

import { retrievalEvidence, retrievalRuns, type DbClient } from "@llm-wiki/db";

const MAX_TRACE_EVIDENCE = 20;

export const RETRIEVAL_TRACE_LIMITS = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MIN_RETENTION_DAYS: 1,
  MAX_RETENTION_DAYS: 3_650,
  MAX_RETENTION_DELETE_COUNT: 1_000,
} as const;

export const RETRIEVAL_OPERATION = {
  ASK: "ask",
  SYNTHESIS: "synthesis",
} as const;

export const RETRIEVAL_POLICY = {
  VAULT_HYBRID: "vault_hybrid",
  SELECTED_NOTES: "selected_notes",
  GENERAL_WEB: "general_web",
  NO_RETRIEVAL: "no_retrieval",
} as const;

export const RETRIEVAL_RUN_STATUS = {
  STARTED: "started",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
} as const;

export type RetrievalOperation = typeof RETRIEVAL_OPERATION[keyof typeof RETRIEVAL_OPERATION];
export type RetrievalPolicy = typeof RETRIEVAL_POLICY[keyof typeof RETRIEVAL_POLICY];
export type RetrievalRunStatus = typeof RETRIEVAL_RUN_STATUS[keyof typeof RETRIEVAL_RUN_STATUS];

export type StartRetrievalRunInput = {
  operation: RetrievalOperation;
  query: string;
  policy: RetrievalPolicy;
  policyReason: string;
  modelProvider?: string;
  modelName?: string;
  promptVersion: string;
};

export type RetrievalEvidenceInput = {
  documentId: string;
  documentPath: string;
  chunkIndex: number;
  contentHash: string;
  source: "vector" | "fts" | "hybrid";
  score: number;
  retrievalRank: number;
  selectionRank?: number;
};

export type CompleteRetrievalRunInput = {
  status: Exclude<RetrievalRunStatus, typeof RETRIEVAL_RUN_STATUS.STARTED>;
  candidateCount: number;
  selectedEvidenceCount: number;
  contextCharacterCount: number;
  durationMs: number;
  errorCode?: string;
};

export type ListRetrievalRunsInput = {
  limit?: number;
  cursor?: string;
  includeEvidence?: boolean;
};

export type PruneRetrievalRunsInput = {
  olderThanDays: number;
  limit: number;
};

export type RetrievalTraceEvidence = {
  documentId: string;
  documentPath: string;
  chunkIndex: number;
  source: "vector" | "fts" | "hybrid";
  score: number;
  retrievalRank: number;
  selectionRank: number | null;
};

export type RetrievalTraceRun = {
  id: string;
  operation: RetrievalOperation;
  policy: RetrievalPolicy;
  policyReason: string;
  status: RetrievalRunStatus;
  candidateCount: number;
  selectedEvidenceCount: number;
  contextCharacterCount: number;
  modelProvider: string | null;
  modelName: string | null;
  promptVersion: string;
  durationMs: number | null;
  errorCode: string | null;
  createdAt: string;
  completedAt: string | null;
  evidence?: RetrievalTraceEvidence[];
};

export type RetrievalTracePage = {
  items: RetrievalTraceRun[];
  nextCursor: string | null;
};

export type PruneRetrievalRunsResult = {
  deletedCount: number;
  cutoff: string;
};

type TraceCursor = {
  createdAt: string;
  id: string;
};

export function hashRetrievalValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function startRetrievalRun(
  db: DbClient,
  input: StartRetrievalRunInput,
): Promise<string> {
  const [run] = await db
    .insert(retrievalRuns)
    .values({
      operation: input.operation,
      query_hash: hashRetrievalValue(input.query),
      query_length: input.query.length,
      policy: input.policy,
      policy_reason: input.policyReason,
      status: RETRIEVAL_RUN_STATUS.STARTED,
      model_provider: input.modelProvider ?? null,
      model_name: input.modelName ?? null,
      prompt_version: input.promptVersion,
    })
    .returning({ id: retrievalRuns.id });
  if (!run) throw new Error("Retrieval run was not created");
  return run.id;
}

export async function recordRetrievalEvidence(
  db: DbClient,
  retrievalRunId: string,
  evidence: RetrievalEvidenceInput[],
): Promise<number> {
  const boundedEvidence = uniqueEvidence(evidence).slice(0, MAX_TRACE_EVIDENCE);
  if (!boundedEvidence.length) return 0;

  await db.insert(retrievalEvidence).values(
    boundedEvidence.map((item) => ({
      retrieval_run_id: retrievalRunId,
      document_id: item.documentId,
      document_path: item.documentPath,
      chunk_index: item.chunkIndex,
      content_hash: item.contentHash,
      source: item.source,
      score: item.score,
      retrieval_rank: item.retrievalRank,
      selection_rank: item.selectionRank ?? null,
    })),
  );
  return boundedEvidence.length;
}

export async function completeRetrievalRun(
  db: DbClient,
  retrievalRunId: string,
  input: CompleteRetrievalRunInput,
): Promise<void> {
  await db
    .update(retrievalRuns)
    .set({
      status: input.status,
      candidate_count: input.candidateCount,
      selected_evidence_count: input.selectedEvidenceCount,
      context_character_count: input.contextCharacterCount,
      duration_ms: input.durationMs,
      error_code: input.errorCode ?? null,
      completed_at: new Date(),
    })
    .where(eq(retrievalRuns.id, retrievalRunId));
}

/**
 * Lists observability metadata only. This deliberately excludes query hashes,
 * raw queries, prompts, packed context, and evidence content hashes.
 */
export async function listRetrievalRuns(
  db: DbClient,
  input: ListRetrievalRunsInput = {},
): Promise<RetrievalTracePage> {
  const normalizedInput = normalizeListRetrievalRunsInput(input);
  const cursor = normalizedInput.cursor ? decodeTraceCursor(normalizedInput.cursor) : null;
  const cursorCondition = cursor
    ? or(
      lt(retrievalRuns.created_at, new Date(cursor.createdAt)),
      and(eq(retrievalRuns.created_at, new Date(cursor.createdAt)), lt(retrievalRuns.id, cursor.id)),
    )
    : undefined;
  const pageSizeWithOverflow = normalizedInput.limit + 1;
  const rows = await db
    .select()
    .from(retrievalRuns)
    .where(cursorCondition)
    .orderBy(desc(retrievalRuns.created_at), desc(retrievalRuns.id))
    .limit(pageSizeWithOverflow);
  const hasNextPage = rows.length > normalizedInput.limit;
  const pageRows = rows.slice(0, normalizedInput.limit);
  const evidenceByRunId = normalizedInput.includeEvidence
    ? await getEvidenceByRunId(db, pageRows.map((row) => row.id))
    : new Map<string, RetrievalTraceEvidence[]>();

  const finalRow = pageRows.at(-1);
  return {
    items: pageRows.map((row) => formatRetrievalTraceRun(row, evidenceByRunId.get(row.id))),
    nextCursor: hasNextPage && finalRow
      ? encodeTraceCursor({ id: finalRow.id, createdAt: finalRow.created_at.toISOString() })
      : null,
  };
}

/**
 * Removes a bounded batch of old runs. The cutoff is reapplied in the delete
 * predicate so a concurrent update can never widen the requested retention.
 */
export async function pruneRetrievalRuns(
  db: DbClient,
  input: PruneRetrievalRunsInput,
  now = new Date(),
): Promise<PruneRetrievalRunsResult> {
  const normalizedInput = normalizePruneRetrievalRunsInput(input);
  const cutoffDate = new Date(now);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - normalizedInput.olderThanDays);
  const expiredRows = await db
    .select({ id: retrievalRuns.id })
    .from(retrievalRuns)
    .where(lt(retrievalRuns.created_at, cutoffDate))
    .orderBy(asc(retrievalRuns.created_at), asc(retrievalRuns.id))
    .limit(normalizedInput.limit);
  const expiredIds = expiredRows.map((row) => row.id);
  const deletedRows = expiredIds.length
    ? await db
      .delete(retrievalRuns)
      .where(and(inArray(retrievalRuns.id, expiredIds), lt(retrievalRuns.created_at, cutoffDate)))
      .returning({ id: retrievalRuns.id })
    : [];

  return {
    deletedCount: deletedRows.length,
    cutoff: cutoffDate.toISOString(),
  };
}

export function normalizeListRetrievalRunsInput(
  input: ListRetrievalRunsInput,
): Required<Pick<ListRetrievalRunsInput, "limit" | "includeEvidence">> & Pick<ListRetrievalRunsInput, "cursor"> {
  const limit = input.limit ?? RETRIEVAL_TRACE_LIMITS.DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1 || limit > RETRIEVAL_TRACE_LIMITS.MAX_PAGE_SIZE) {
    throw new Error(`Retrieval trace limit must be an integer from 1 to ${RETRIEVAL_TRACE_LIMITS.MAX_PAGE_SIZE}`);
  }
  if (input.cursor !== undefined) decodeTraceCursor(input.cursor);

  return {
    limit,
    cursor: input.cursor,
    includeEvidence: input.includeEvidence ?? false,
  };
}

export function normalizePruneRetrievalRunsInput(
  input: PruneRetrievalRunsInput,
): PruneRetrievalRunsInput {
  if (
    !Number.isInteger(input.olderThanDays)
    || input.olderThanDays < RETRIEVAL_TRACE_LIMITS.MIN_RETENTION_DAYS
    || input.olderThanDays > RETRIEVAL_TRACE_LIMITS.MAX_RETENTION_DAYS
  ) {
    throw new Error(
      `Retrieval trace retention must be an integer from ${RETRIEVAL_TRACE_LIMITS.MIN_RETENTION_DAYS} to ${RETRIEVAL_TRACE_LIMITS.MAX_RETENTION_DAYS} days`,
    );
  }
  if (
    !Number.isInteger(input.limit)
    || input.limit < 1
    || input.limit > RETRIEVAL_TRACE_LIMITS.MAX_RETENTION_DELETE_COUNT
  ) {
    throw new Error(
      `Retrieval trace delete limit must be an integer from 1 to ${RETRIEVAL_TRACE_LIMITS.MAX_RETENTION_DELETE_COUNT}`,
    );
  }
  return input;
}

export function encodeTraceCursor(cursor: TraceCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeTraceCursor(value: string): TraceCursor {
  try {
    const parsedValue: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      !parsedValue
      || typeof parsedValue !== "object"
      || Array.isArray(parsedValue)
      || !("id" in parsedValue)
      || !("createdAt" in parsedValue)
      || typeof parsedValue.id !== "string"
      || typeof parsedValue.createdAt !== "string"
      || !Number.isFinite(Date.parse(parsedValue.createdAt))
    ) {
      throw new Error("Invalid retrieval trace cursor");
    }
    return { id: parsedValue.id, createdAt: parsedValue.createdAt };
  } catch {
    throw new Error("Invalid retrieval trace cursor");
  }
}

async function getEvidenceByRunId(
  db: DbClient,
  runIds: string[],
): Promise<Map<string, RetrievalTraceEvidence[]>> {
  if (!runIds.length) return new Map();
  const rows = await db
    .select()
    .from(retrievalEvidence)
    .where(inArray(retrievalEvidence.retrieval_run_id, runIds))
    .orderBy(
      asc(retrievalEvidence.retrieval_run_id),
      asc(retrievalEvidence.retrieval_rank),
      asc(retrievalEvidence.id),
    );
  const evidenceByRunId = new Map<string, RetrievalTraceEvidence[]>();
  for (const row of rows) {
    const evidence = evidenceByRunId.get(row.retrieval_run_id) ?? [];
    evidence.push({
      documentId: row.document_id,
      documentPath: row.document_path,
      chunkIndex: row.chunk_index,
      source: asRetrievalEvidenceSource(row.source),
      score: row.score,
      retrievalRank: row.retrieval_rank,
      selectionRank: row.selection_rank,
    });
    evidenceByRunId.set(row.retrieval_run_id, evidence);
  }
  return evidenceByRunId;
}

export function formatRetrievalTraceRun(
  row: typeof retrievalRuns.$inferSelect,
  evidence: RetrievalTraceEvidence[] | undefined,
): RetrievalTraceRun {
  return {
    id: row.id,
    operation: asRetrievalOperation(row.operation),
    policy: asRetrievalPolicy(row.policy),
    policyReason: row.policy_reason,
    status: asRetrievalRunStatus(row.status),
    candidateCount: row.candidate_count,
    selectedEvidenceCount: row.selected_evidence_count,
    contextCharacterCount: row.context_character_count,
    modelProvider: row.model_provider,
    modelName: row.model_name,
    promptVersion: row.prompt_version,
    durationMs: row.duration_ms,
    errorCode: row.error_code,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
    ...(evidence ? { evidence } : {}),
  };
}

function asRetrievalOperation(value: string): RetrievalOperation {
  if (value === RETRIEVAL_OPERATION.ASK || value === RETRIEVAL_OPERATION.SYNTHESIS) return value;
  throw new Error(`Unknown retrieval operation: ${value}`);
}

function asRetrievalPolicy(value: string): RetrievalPolicy {
  if (Object.values(RETRIEVAL_POLICY).includes(value as RetrievalPolicy)) return value as RetrievalPolicy;
  throw new Error(`Unknown retrieval policy: ${value}`);
}

function asRetrievalRunStatus(value: string): RetrievalRunStatus {
  if (Object.values(RETRIEVAL_RUN_STATUS).includes(value as RetrievalRunStatus)) return value as RetrievalRunStatus;
  throw new Error(`Unknown retrieval run status: ${value}`);
}

function asRetrievalEvidenceSource(value: string): RetrievalTraceEvidence["source"] {
  if (value === "vector" || value === "fts" || value === "hybrid") return value;
  throw new Error(`Unknown retrieval evidence source: ${value}`);
}

function uniqueEvidence(evidence: RetrievalEvidenceInput[]): RetrievalEvidenceInput[] {
  const unique = new Map<string, RetrievalEvidenceInput>();
  for (const item of evidence) {
    const key = `${item.documentId}:${item.chunkIndex}`;
    const existing = unique.get(key);
    if (!existing || item.retrievalRank < existing.retrievalRank) {
      unique.set(key, item);
    }
  }
  return [...unique.values()].sort((left, right) => left.retrievalRank - right.retrievalRank);
}
