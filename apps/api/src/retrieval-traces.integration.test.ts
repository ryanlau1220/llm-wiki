import crypto from "node:crypto";

import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import {
  completeRetrievalRun,
  hashRetrievalValue,
  recordRetrievalEvidence,
  RETRIEVAL_OPERATION,
  RETRIEVAL_POLICY,
  RETRIEVAL_RUN_STATUS,
  startRetrievalRun,
} from "@llm-wiki/core";
import { createDbClient, retrievalRuns } from "@llm-wiki/db";

import { listRetrievalTracePage } from "./retrieval-traces";

const DATABASE_URL = process.env.DATABASE_URL;
const describeWithDatabase = DATABASE_URL ? describe : describe.skip;
const TRACE_PROMPT_VERSION = "trace-api-integration-v1";
const TRACE_QUERY = "A query that must never appear in trace read responses";
const FUTURE_TRACE_DATES = [
  new Date("2099-01-01T00:00:03.000Z"),
  new Date("2099-01-01T00:00:02.000Z"),
  new Date("2099-01-01T00:00:01.000Z"),
];

describeWithDatabase("retrieval trace API service", () => {
  const runIds: string[] = [];

  afterEach(async () => {
    const { db } = createDbClient(DATABASE_URL!);
    for (const runId of runIds.splice(0)) {
      await db.delete(retrievalRuns).where(eq(retrievalRuns.id, runId));
    }
  });

  test("returns stable pages with optional safe evidence metadata", async () => {
    const { db } = createDbClient(DATABASE_URL!);
    const createdRunIds: string[] = [];

    for (const createdAt of FUTURE_TRACE_DATES) {
      const runId = await startRetrievalRun(db, {
        operation: RETRIEVAL_OPERATION.ASK,
        query: TRACE_QUERY,
        policy: RETRIEVAL_POLICY.VAULT_HYBRID,
        policyReason: "explicit_vault_mode",
        promptVersion: TRACE_PROMPT_VERSION,
      });
      runIds.push(runId);
      createdRunIds.push(runId);
      await completeRetrievalRun(db, runId, {
        status: RETRIEVAL_RUN_STATUS.SUCCEEDED,
        candidateCount: 1,
        selectedEvidenceCount: 1,
        contextCharacterCount: 100,
        durationMs: 1,
      });
      await db.update(retrievalRuns).set({ created_at: createdAt }).where(eq(retrievalRuns.id, runId));
    }

    await recordRetrievalEvidence(db, createdRunIds[0]!, [{
      documentId: crypto.randomUUID(),
      documentPath: "research/trace-api-test.md",
      chunkIndex: 0,
      contentHash: hashRetrievalValue("This private chunk must not be returned"),
      source: "hybrid",
      score: 0.9,
      retrievalRank: 1,
      selectionRank: 1,
    }]);

    const config = { databaseUrl: DATABASE_URL! };
    const firstPage = await listRetrievalTracePage(config, { limit: 2, includeEvidence: true });

    expect(firstPage.items.map((item) => item.id)).toEqual(createdRunIds.slice(0, 2));
    expect(firstPage.nextCursor).not.toBeNull();
    expect(firstPage.items[0]?.evidence).toEqual([{
      documentId: expect.any(String),
      documentPath: "research/trace-api-test.md",
      chunkIndex: 0,
      source: "hybrid",
      score: 0.9,
      retrievalRank: 1,
      selectionRank: 1,
    }]);
    expect(JSON.stringify(firstPage)).not.toContain(TRACE_QUERY);
    expect(JSON.stringify(firstPage)).not.toContain("This private chunk must not be returned");

    const secondPage = await listRetrievalTracePage(config, {
      limit: 2,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage.items.map((item) => item.id)).toContain(createdRunIds[2]!);
    expect(secondPage.items.every((item) => item.evidence === undefined)).toBe(true);
  });
});
