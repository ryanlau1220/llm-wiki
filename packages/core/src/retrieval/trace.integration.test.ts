import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { createDbClient, retrievalRuns } from "@llm-wiki/db";

import {
  AI_TRACE_OPERATION,
  AI_TRACE_POLICY,
  AI_TRACE_SPAN_TYPE,
  AI_TRACE_STATUS,
  completeAiTrace,
  completeAiTraceSpan,
  getAiTrace,
  startAiTrace,
  startAiTraceSpan,
} from "./trace";

const DATABASE_URL = process.env.DATABASE_URL;
const describeWithDatabase = DATABASE_URL ? describe : describe.skip;

describeWithDatabase("AI trace persistence", () => {
  const traceIds: string[] = [];

  afterEach(async () => {
    const { db } = createDbClient(DATABASE_URL!);
    for (const traceId of traceIds.splice(0)) await db.delete(retrievalRuns).where(eq(retrievalRuns.id, traceId));
  });

  test("returns persisted nested spans and failed tool/model metadata without private payloads", async () => {
    const { db } = createDbClient(DATABASE_URL!);
    const traceId = await startAiTrace(db, { operation: AI_TRACE_OPERATION.ASK, query: "private query must not be returned", policy: AI_TRACE_POLICY.GENERAL_WEB, policyReason: "explicit_general_mode", promptVersion: "ask-v1" });
    traceIds.push(traceId);
    const requestId = await startAiTraceSpan(db, traceId, { spanType: AI_TRACE_SPAN_TYPE.REQUEST, attributes: { input_length: 33 } });
    const toolId = await startAiTraceSpan(db, traceId, { spanType: AI_TRACE_SPAN_TYPE.TOOL, parentSpanId: requestId, attributes: { tool_name: "web_search" } });
    const modelId = await startAiTraceSpan(db, traceId, { spanType: AI_TRACE_SPAN_TYPE.MODEL, parentSpanId: requestId, attributes: { provider: "test", prompt_tokens: 12, candidate_tokens: 4, total_tokens: 16 } });
    await completeAiTraceSpan(db, toolId, { status: AI_TRACE_STATUS.FAILED, durationMs: 3, errorCode: "web_search_failed" });
    await completeAiTraceSpan(db, modelId, { status: AI_TRACE_STATUS.FAILED, durationMs: 5, errorCode: "generation_failed" });
    await completeAiTraceSpan(db, requestId, { status: AI_TRACE_STATUS.FAILED, durationMs: 8, errorCode: "generation_failed" });
    await completeAiTrace(db, traceId, { status: AI_TRACE_STATUS.FAILED, candidateCount: 0, selectedEvidenceCount: 0, contextCharacterCount: 0, durationMs: 8, errorCode: "generation_failed" });

    const detail = await getAiTrace(db, traceId);
    expect(detail?.status).toBe(AI_TRACE_STATUS.FAILED);
    expect(detail?.spans?.map((span) => [span.spanType, span.parentSpanId, span.status, span.errorCode])).toEqual([
      [AI_TRACE_SPAN_TYPE.REQUEST, null, AI_TRACE_STATUS.FAILED, "generation_failed"],
      [AI_TRACE_SPAN_TYPE.TOOL, requestId, AI_TRACE_STATUS.FAILED, "web_search_failed"],
      [AI_TRACE_SPAN_TYPE.MODEL, requestId, AI_TRACE_STATUS.FAILED, "generation_failed"],
    ]);
    expect(JSON.stringify(detail)).not.toContain("private query must not be returned");
  });
});
