import crypto from "node:crypto";
import { aiTraceSpans, type DbClient, retrievalEvidence, retrievalRuns } from "@llm-wiki/db";
import { and, asc, count, desc, eq, inArray, lt, or } from "drizzle-orm";

const MAX_TRACE_EVIDENCE = 20;
const MAX_SPANS_PER_TRACE = 40;
const MAX_SPAN_ATTRIBUTES = 16;
const MAX_ATTRIBUTE_VALUE_LENGTH = 160;

export const AI_TRACE_LIMITS = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MAX_SPANS_PER_TRACE,
} as const;

export const AI_TRACE_VERSION = "ai-generator-v1";
export const AI_TRACE_OPERATION = {
  ASK: "ask",
  SYNTHESIS: "synthesis",
  BOOTSTRAP: "bootstrap",
} as const;
export const AI_TRACE_POLICY = {
  VAULT_HYBRID: "vault_hybrid",
  SELECTED_NOTES: "selected_notes",
  GENERAL_WEB: "general_web",
  NO_RETRIEVAL: "no_retrieval",
} as const;
export const AI_TRACE_STATUS = {
  STARTED: "started",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
} as const;
export const AI_TRACE_SPAN_TYPE = {
  REQUEST: "request",
  POLICY: "policy",
  RETRIEVAL: "retrieval",
  RERANKING: "reranking",
  CONTEXT_PACKING: "context_packing",
  MODEL: "model",
  TOOL: "tool",
  RETRY: "retry",
  FINAL_ANSWER: "final_answer",
} as const;

export type AiTraceOperation = (typeof AI_TRACE_OPERATION)[keyof typeof AI_TRACE_OPERATION];
export type AiTracePolicy = (typeof AI_TRACE_POLICY)[keyof typeof AI_TRACE_POLICY];
export type AiTraceStatus = (typeof AI_TRACE_STATUS)[keyof typeof AI_TRACE_STATUS];
export type AiTraceSpanType = (typeof AI_TRACE_SPAN_TYPE)[keyof typeof AI_TRACE_SPAN_TYPE];
export type AiTraceSpanAttributes = Record<string, string | number | boolean | null>;
// Kept as source-compatibility aliases for retrieval policy helpers. New code
// should use the AI_TRACE names above.
export const RETRIEVAL_POLICY = AI_TRACE_POLICY;
export type RetrievalPolicy = AiTracePolicy;

export type StartAiTraceInput = {
  operation: AiTraceOperation;
  query: string;
  policy: AiTracePolicy;
  policyReason: string;
  modelProvider?: string;
  modelName?: string;
  promptVersion: string;
};
export type RecordAiTraceEvidenceInput = {
  documentId: string;
  documentPath: string;
  chunkIndex: number;
  contentHash: string;
  source: "vector" | "fts" | "hybrid";
  score: number;
  retrievalRank: number;
  selectionRank?: number;
};
export type CompleteAiTraceInput = {
  status: Exclude<AiTraceStatus, typeof AI_TRACE_STATUS.STARTED>;
  candidateCount: number;
  selectedEvidenceCount: number;
  contextCharacterCount: number;
  durationMs: number;
  errorCode?: string;
};
export type StartAiTraceSpanInput = {
  spanType: AiTraceSpanType;
  parentSpanId?: string;
  attributes?: AiTraceSpanAttributes;
};
export type CompleteAiTraceSpanInput = {
  status: Exclude<AiTraceStatus, typeof AI_TRACE_STATUS.STARTED>;
  durationMs: number;
  errorCode?: string;
  attributes?: AiTraceSpanAttributes;
};
export type ListAiTracesInput = { limit?: number; cursor?: string; includeEvidence?: boolean };
export type AiTraceEvidence = Omit<RecordAiTraceEvidenceInput, "contentHash" | "selectionRank"> & {
  selectionRank: number | null;
};
export type AiTraceSpan = {
  id: string;
  parentSpanId: string | null;
  spanType: AiTraceSpanType;
  status: AiTraceStatus;
  attributes: AiTraceSpanAttributes;
  errorCode: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
};
export type AiTraceRun = {
  id: string;
  traceVersion: string;
  operation: AiTraceOperation;
  policy: AiTracePolicy;
  policyReason: string;
  status: AiTraceStatus;
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
  evidence?: AiTraceEvidence[];
  spans?: AiTraceSpan[];
};
export type AiTracePage = { items: AiTraceRun[]; nextCursor: string | null; totalCount: number };
type TraceCursor = { createdAt: string; id: string };

export function hashRetrievalValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function startAiTrace(db: DbClient, input: StartAiTraceInput): Promise<string> {
  const [run] = await db
    .insert(retrievalRuns)
    .values({
      operation: input.operation,
      trace_version: 1,
      query_hash: hashRetrievalValue(input.query),
      query_length: input.query.length,
      policy: input.policy,
      policy_reason: input.policyReason,
      status: AI_TRACE_STATUS.STARTED,
      model_provider: input.modelProvider ?? null,
      model_name: input.modelName ?? null,
      prompt_version: input.promptVersion,
    })
    .returning({ id: retrievalRuns.id });
  if (!run) throw new Error("AI trace was not created");
  return run.id;
}

export async function startAiTraceSpan(
  db: DbClient,
  traceId: string,
  input: StartAiTraceSpanInput,
): Promise<string> {
  const attributes = normalizeAiTraceSpanAttributes(input.attributes ?? {});
  const [spanCount] = await db
    .select({ value: count() })
    .from(aiTraceSpans)
    .where(eq(aiTraceSpans.retrieval_run_id, traceId));
  if ((spanCount?.value ?? 0) >= MAX_SPANS_PER_TRACE)
    throw new Error(`AI traces allow at most ${MAX_SPANS_PER_TRACE} spans`);
  const [span] = await db
    .insert(aiTraceSpans)
    .values({
      retrieval_run_id: traceId,
      parent_span_id: input.parentSpanId ?? null,
      span_type: input.spanType,
      status: AI_TRACE_STATUS.STARTED,
      attributes,
    })
    .returning({ id: aiTraceSpans.id });
  if (!span) throw new Error("AI trace span was not created");
  return span.id;
}

export async function completeAiTraceSpan(
  db: DbClient,
  spanId: string,
  input: CompleteAiTraceSpanInput,
): Promise<void> {
  await db
    .update(aiTraceSpans)
    .set({
      status: input.status,
      duration_ms: nonNegativeInteger(input.durationMs, "Span duration"),
      error_code: input.errorCode ?? null,
      attributes: normalizeAiTraceSpanAttributes(input.attributes ?? {}),
      completed_at: new Date(),
    })
    .where(eq(aiTraceSpans.id, spanId));
}

export async function recordAiTraceEvidence(
  db: DbClient,
  traceId: string,
  evidence: RecordAiTraceEvidenceInput[],
): Promise<number> {
  const boundedEvidence = uniqueEvidence(evidence).slice(0, MAX_TRACE_EVIDENCE);
  if (!boundedEvidence.length) return 0;
  await db.insert(retrievalEvidence).values(
    boundedEvidence.map((item) => ({
      retrieval_run_id: traceId,
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

export async function completeAiTrace(
  db: DbClient,
  traceId: string,
  input: CompleteAiTraceInput,
): Promise<void> {
  await db
    .update(retrievalRuns)
    .set({
      status: input.status,
      candidate_count: nonNegativeInteger(input.candidateCount, "Candidate count"),
      selected_evidence_count: nonNegativeInteger(
        input.selectedEvidenceCount,
        "Selected evidence count",
      ),
      context_character_count: nonNegativeInteger(
        input.contextCharacterCount,
        "Context character count",
      ),
      duration_ms: nonNegativeInteger(input.durationMs, "Trace duration"),
      error_code: input.errorCode ?? null,
      completed_at: new Date(),
    })
    .where(eq(retrievalRuns.id, traceId));
}

/** Lists structural metadata only; sensitive request and generated payloads cannot escape this boundary. */
export async function listAiTraces(
  db: DbClient,
  input: ListAiTracesInput = {},
): Promise<AiTracePage> {
  const normalizedInput = normalizeListAiTracesInput(input);
  const cursor = normalizedInput.cursor ? decodeTraceCursor(normalizedInput.cursor) : null;
  const cursorCondition = cursor
    ? or(
        lt(retrievalRuns.created_at, new Date(cursor.createdAt)),
        and(
          eq(retrievalRuns.created_at, new Date(cursor.createdAt)),
          lt(retrievalRuns.id, cursor.id),
        ),
      )
    : undefined;
  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(retrievalRuns)
      .where(cursorCondition)
      .orderBy(desc(retrievalRuns.created_at), desc(retrievalRuns.id))
      .limit(normalizedInput.limit + 1),
    db.select({ totalCount: count() }).from(retrievalRuns),
  ]);
  const pageRows = rows.slice(0, normalizedInput.limit);
  const evidenceByRunId = normalizedInput.includeEvidence
    ? await getEvidenceByRunId(
        db,
        pageRows.map((row) => row.id),
      )
    : new Map<string, AiTraceEvidence[]>();
  const finalRow = pageRows.at(-1);
  return {
    items: pageRows.map((row) => formatAiTraceRun(row, evidenceByRunId.get(row.id))),
    nextCursor:
      rows.length > normalizedInput.limit && finalRow
        ? encodeTraceCursor({ id: finalRow.id, createdAt: finalRow.created_at.toISOString() })
        : null,
    totalCount: Number(countRows[0]?.totalCount ?? 0),
  };
}

export async function getAiTrace(db: DbClient, traceId: string): Promise<AiTraceRun | null> {
  const [row] = await db.select().from(retrievalRuns).where(eq(retrievalRuns.id, traceId)).limit(1);
  if (!row) return null;
  const [evidenceByRunId, spansByRunId] = await Promise.all([
    getEvidenceByRunId(db, [traceId]),
    getSpansByRunId(db, [traceId]),
  ]);
  return formatAiTraceRun(row, evidenceByRunId.get(traceId), spansByRunId.get(traceId));
}

export function normalizeListAiTracesInput(
  input: ListAiTracesInput,
): Required<Pick<ListAiTracesInput, "limit" | "includeEvidence">> &
  Pick<ListAiTracesInput, "cursor"> {
  const limit = input.limit ?? AI_TRACE_LIMITS.DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1 || limit > AI_TRACE_LIMITS.MAX_PAGE_SIZE)
    throw new Error(`AI trace limit must be an integer from 1 to ${AI_TRACE_LIMITS.MAX_PAGE_SIZE}`);
  if (input.cursor !== undefined) decodeTraceCursor(input.cursor);
  return { limit, cursor: input.cursor, includeEvidence: input.includeEvidence ?? false };
}
export function encodeTraceCursor(cursor: TraceCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
export function decodeTraceCursor(value: string): TraceCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      !("id" in parsed) ||
      !("createdAt" in parsed) ||
      typeof parsed.id !== "string" ||
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.createdAt))
    )
      throw new Error();
    return { id: parsed.id, createdAt: parsed.createdAt };
  } catch {
    throw new Error("Invalid AI trace cursor");
  }
}

export function formatAiTraceRun(
  row: typeof retrievalRuns.$inferSelect,
  evidence?: AiTraceEvidence[],
  spans?: AiTraceSpan[],
): AiTraceRun {
  return {
    id: row.id,
    traceVersion: row.trace_version === 1 ? AI_TRACE_VERSION : `legacy-v${row.trace_version}`,
    operation: asOperation(row.operation),
    policy: asPolicy(row.policy),
    policyReason: row.policy_reason,
    status: asStatus(row.status),
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
    ...(spans ? { spans } : {}),
  };
}

export function normalizeAiTraceSpanAttributes(
  attributes: AiTraceSpanAttributes,
): AiTraceSpanAttributes {
  const entries = Object.entries(attributes);
  if (entries.length > MAX_SPAN_ATTRIBUTES)
    throw new Error(`AI trace spans allow at most ${MAX_SPAN_ATTRIBUTES} attributes`);
  for (const [key, value] of entries) {
    if (
      !/^[a-z][a-z0-9_]*$/.test(key) ||
      key.includes("query") ||
      (key.includes("prompt") && key !== "prompt_tokens") ||
      key.includes("context") ||
      key.includes("output")
    )
      throw new Error("AI trace span attribute key is not allowed");
    if (
      !(
        value === null ||
        typeof value === "boolean" ||
        typeof value === "number" ||
        (typeof value === "string" && value.length <= MAX_ATTRIBUTE_VALUE_LENGTH)
      )
    )
      throw new Error("AI trace span attribute value is not allowed");
  }
  return attributes;
}
function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${label} must be a non-negative integer`);
  return value;
}
async function getEvidenceByRunId(
  db: DbClient,
  runIds: string[],
): Promise<Map<string, AiTraceEvidence[]>> {
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
  const result = new Map<string, AiTraceEvidence[]>();
  for (const row of rows) {
    const items = result.get(row.retrieval_run_id) ?? [];
    items.push({
      documentId: row.document_id,
      documentPath: row.document_path,
      chunkIndex: row.chunk_index,
      source: asSource(row.source),
      score: row.score,
      retrievalRank: row.retrieval_rank,
      selectionRank: row.selection_rank,
    });
    result.set(row.retrieval_run_id, items);
  }
  return result;
}
async function getSpansByRunId(
  db: DbClient,
  runIds: string[],
): Promise<Map<string, AiTraceSpan[]>> {
  if (!runIds.length) return new Map();
  const rows = await db
    .select()
    .from(aiTraceSpans)
    .where(inArray(aiTraceSpans.retrieval_run_id, runIds))
    .orderBy(
      asc(aiTraceSpans.retrieval_run_id),
      asc(aiTraceSpans.started_at),
      asc(aiTraceSpans.id),
    );
  const result = new Map<string, AiTraceSpan[]>();
  for (const row of rows) {
    const items = result.get(row.retrieval_run_id) ?? [];
    items.push({
      id: row.id,
      parentSpanId: row.parent_span_id,
      spanType: asSpanType(row.span_type),
      status: asStatus(row.status),
      attributes: row.attributes as AiTraceSpanAttributes,
      errorCode: row.error_code,
      startedAt: row.started_at.toISOString(),
      completedAt: row.completed_at?.toISOString() ?? null,
      durationMs: row.duration_ms,
    });
    result.set(row.retrieval_run_id, items);
  }
  return result;
}
function asOperation(value: string): AiTraceOperation {
  if (Object.values(AI_TRACE_OPERATION).includes(value as AiTraceOperation))
    return value as AiTraceOperation;
  throw new Error(`Unknown AI trace operation: ${value}`);
}
function asPolicy(value: string): AiTracePolicy {
  if (Object.values(AI_TRACE_POLICY).includes(value as AiTracePolicy))
    return value as AiTracePolicy;
  throw new Error(`Unknown AI trace policy: ${value}`);
}
function asStatus(value: string): AiTraceStatus {
  if (Object.values(AI_TRACE_STATUS).includes(value as AiTraceStatus))
    return value as AiTraceStatus;
  throw new Error(`Unknown AI trace status: ${value}`);
}
function asSpanType(value: string): AiTraceSpanType {
  if (Object.values(AI_TRACE_SPAN_TYPE).includes(value as AiTraceSpanType))
    return value as AiTraceSpanType;
  throw new Error(`Unknown AI trace span type: ${value}`);
}
function asSource(value: string): AiTraceEvidence["source"] {
  if (value === "vector" || value === "fts" || value === "hybrid") return value;
  throw new Error(`Unknown AI trace evidence source: ${value}`);
}
function uniqueEvidence(evidence: RecordAiTraceEvidenceInput[]): RecordAiTraceEvidenceInput[] {
  const unique = new Map<string, RecordAiTraceEvidenceInput>();
  for (const item of evidence) {
    const key = `${item.documentId}:${item.chunkIndex}`;
    const existing = unique.get(key);
    if (!existing || item.retrievalRank < existing.retrievalRank) unique.set(key, item);
  }
  return [...unique.values()].sort((a, b) => a.retrievalRank - b.retrievalRank);
}
