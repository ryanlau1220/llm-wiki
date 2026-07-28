import { describe, expect, test } from "bun:test";

import type { retrievalRuns } from "@llm-wiki/db";

import {
  AI_TRACE_OPERATION,
  AI_TRACE_POLICY,
  AI_TRACE_STATUS,
  decodeTraceCursor,
  encodeTraceCursor,
  formatAiTraceRun,
  normalizeListAiTracesInput,
  startAiTraceSpan,
} from "./trace";

const TRACE_ID = "11111111-1111-4111-8111-111111111111";
const TRACE_DATE = new Date("2026-07-24T00:00:00.000Z");
const SENSITIVE_QUERY = "What is in my private vault?";

describe("AI trace contract privacy boundaries", () => {
  test("uses opaque cursors and deterministic pagination bounds", () => {
    const cursor = encodeTraceCursor({ id: TRACE_ID, createdAt: TRACE_DATE.toISOString() });
    expect(decodeTraceCursor(cursor)).toEqual({ id: TRACE_ID, createdAt: TRACE_DATE.toISOString() });
    expect(() => decodeTraceCursor("not-a-trace-cursor")).toThrow("Invalid AI trace cursor");
    expect(normalizeListAiTracesInput({})).toMatchObject({ limit: 20, includeEvidence: false });
    expect(() => normalizeListAiTracesInput({ limit: 0 })).toThrow("AI trace limit");
    expect(() => normalizeListAiTracesInput({ limit: 101 })).toThrow("AI trace limit");
  });

  test("projects only structural run metadata", () => {
    const rawRun = { id: TRACE_ID, trace_version: 1, operation: AI_TRACE_OPERATION.ASK, query_hash: SENSITIVE_QUERY, query_length: SENSITIVE_QUERY.length, policy: AI_TRACE_POLICY.VAULT_HYBRID, policy_reason: "explicit_vault_mode", status: AI_TRACE_STATUS.SUCCEEDED, candidate_count: 3, selected_evidence_count: 2, context_character_count: 512, model_provider: "test-provider", model_name: "test-model", prompt_version: "ask-v1", duration_ms: 42, error_code: null, created_at: TRACE_DATE, completed_at: TRACE_DATE } as unknown as typeof retrievalRuns.$inferSelect;
    const trace = formatAiTraceRun(rawRun, [{ documentId: "22222222-2222-4222-8222-222222222222", documentPath: "research/private.md", chunkIndex: 0, source: "hybrid", score: 0.9, retrievalRank: 1, selectionRank: 1 }]);
    expect(JSON.stringify(trace)).not.toContain(SENSITIVE_QUERY);
    expect(trace).not.toHaveProperty("queryHash");
    expect(trace).not.toHaveProperty("queryLength");
    expect(trace.evidence?.[0]).not.toHaveProperty("contentHash");
  });

  test("rejects span fields that could persist private payloads", async () => {
    const db = {} as any;
    await expect(startAiTraceSpan(db, TRACE_ID, { spanType: "model", attributes: { provider: "local" } })).rejects.toThrow();
    await expect(startAiTraceSpan(db, TRACE_ID, { spanType: "model", attributes: { prompt_text: "secret" } })).rejects.toThrow("not allowed");
    await expect(startAiTraceSpan(db, TRACE_ID, { spanType: "context_packing", attributes: { packed_characters: 512 } })).rejects.toThrow();
  });
});
