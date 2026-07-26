import { describe, expect, test } from "bun:test";

import type { retrievalRuns } from "@llm-wiki/db";

import {
  decodeTraceCursor,
  encodeTraceCursor,
  formatRetrievalTraceRun,
  normalizeListRetrievalRunsInput,
  normalizePruneRetrievalRunsInput,
  RETRIEVAL_OPERATION,
  RETRIEVAL_POLICY,
  RETRIEVAL_RUN_STATUS,
} from "./trace";

const TRACE_ID = "11111111-1111-4111-8111-111111111111";
const TRACE_DATE = new Date("2026-07-24T00:00:00.000Z");
const SENSITIVE_QUERY = "What is in my private vault?";
const SENSITIVE_CONTEXT_HASH = "context-hash-must-not-be-exposed";

describe("retrieval trace read boundaries", () => {
  test("uses a round-trippable opaque cursor and rejects malformed cursors", () => {
    const cursor = encodeTraceCursor({ id: TRACE_ID, createdAt: TRACE_DATE.toISOString() });

    expect(decodeTraceCursor(cursor)).toEqual({
      id: TRACE_ID,
      createdAt: TRACE_DATE.toISOString(),
    });
    expect(() => decodeTraceCursor("not-a-trace-cursor")).toThrow("Invalid retrieval trace cursor");
  });

  test("enforces deterministic page and retention bounds", () => {
    expect(normalizeListRetrievalRunsInput({})).toMatchObject({
      limit: 20,
      includeEvidence: false,
    });
    expect(() => normalizeListRetrievalRunsInput({ limit: 0 })).toThrow("Retrieval trace limit");
    expect(() => normalizeListRetrievalRunsInput({ limit: 101 })).toThrow("Retrieval trace limit");
    expect(() => normalizePruneRetrievalRunsInput({ olderThanDays: 0, limit: 1 })).toThrow("retention");
    expect(() => normalizePruneRetrievalRunsInput({ olderThanDays: 1, limit: 1_001 })).toThrow("delete limit");
  });

  test("projects only safe run metadata", () => {
    const rawRun = {
      id: TRACE_ID,
      operation: RETRIEVAL_OPERATION.ASK,
      query_hash: SENSITIVE_QUERY,
      query_length: SENSITIVE_QUERY.length,
      policy: RETRIEVAL_POLICY.VAULT_HYBRID,
      policy_reason: "explicit_vault_mode",
      status: RETRIEVAL_RUN_STATUS.SUCCEEDED,
      candidate_count: 3,
      selected_evidence_count: 2,
      context_character_count: 512,
      model_provider: "test-provider",
      model_name: "test-model",
      prompt_version: "ask-v1",
      duration_ms: 42,
      error_code: null,
      created_at: TRACE_DATE,
      completed_at: TRACE_DATE,
    } as unknown as typeof retrievalRuns.$inferSelect;

    const trace = formatRetrievalTraceRun(rawRun, [{
      documentId: "22222222-2222-4222-8222-222222222222",
      documentPath: "research/private.md",
      chunkIndex: 0,
      source: "hybrid",
      score: 0.9,
      retrievalRank: 1,
      selectionRank: 1,
    }]);
    const serializedTrace = JSON.stringify(trace);

    expect(serializedTrace).not.toContain(SENSITIVE_QUERY);
    expect(serializedTrace).not.toContain(SENSITIVE_CONTEXT_HASH);
    expect(trace).not.toHaveProperty("queryHash");
    expect(trace).not.toHaveProperty("queryLength");
    expect(trace.evidence?.[0]).not.toHaveProperty("contentHash");
  });
});
