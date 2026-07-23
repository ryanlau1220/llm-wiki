import crypto from "node:crypto";

import { eq } from "drizzle-orm";

import { retrievalEvidence, retrievalRuns, type DbClient } from "@llm-wiki/db";

const MAX_TRACE_EVIDENCE = 20;

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
