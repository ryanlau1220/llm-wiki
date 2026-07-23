import crypto from "node:crypto";

import { afterEach, describe, expect, test } from "bun:test";
import { asc, eq } from "drizzle-orm";

import { createDbClient, retrievalEvidence, retrievalRuns } from "@llm-wiki/db";

import {
  completeRetrievalRun,
  hashRetrievalValue,
  recordRetrievalEvidence,
  RETRIEVAL_OPERATION,
  RETRIEVAL_POLICY,
  RETRIEVAL_RUN_STATUS,
  startRetrievalRun,
} from "./trace";

const DATABASE_URL = process.env.DATABASE_URL;
const describeWithDatabase = DATABASE_URL ? describe : describe.skip;
const TEST_QUERY = "How does private retrieval tracing stay bounded?";
const TEST_DOCUMENT_PATH = "research/retrieval-trace.md";

describeWithDatabase("retrieval trace", () => {
  const runIds: string[] = [];

  afterEach(async () => {
    const { db } = createDbClient(DATABASE_URL!);
    for (const runId of runIds.splice(0)) {
      await db.delete(retrievalRuns).where(eq(retrievalRuns.id, runId));
    }
  });

  test("stores bounded evidence references without persisting the raw query or chunk text", async () => {
    const { db } = createDbClient(DATABASE_URL!);
    const runId = await startRetrievalRun(db, {
      operation: RETRIEVAL_OPERATION.ASK,
      query: TEST_QUERY,
      policy: RETRIEVAL_POLICY.VAULT_HYBRID,
      policyReason: "explicit_vault_question",
      modelProvider: "test-provider",
      modelName: "test-model",
      promptVersion: "ask-v1",
    });
    runIds.push(runId);

    const documentId = crypto.randomUUID();
    const evidence = Array.from({ length: 25 }, (_, index) => ({
      documentId: index === 1 ? documentId : crypto.randomUUID(),
      documentPath: TEST_DOCUMENT_PATH,
      chunkIndex: index === 1 ? 0 : index,
      contentHash: hashRetrievalValue(`private chunk ${index}`),
      source: "hybrid" as const,
      score: 1 - index / 100,
      retrievalRank: index + 1,
      selectionRank: index + 1,
    }));
    evidence[1] = { ...evidence[1]!, retrievalRank: 2 };

    const recordedCount = await recordRetrievalEvidence(db, runId, evidence);
    await completeRetrievalRun(db, runId, {
      status: RETRIEVAL_RUN_STATUS.SUCCEEDED,
      candidateCount: evidence.length,
      selectedEvidenceCount: recordedCount,
      contextCharacterCount: 800,
      durationMs: 42,
    });

    expect(recordedCount).toBe(20);
    const [run] = await db
      .select()
      .from(retrievalRuns)
      .where(eq(retrievalRuns.id, runId));
    expect(run).toMatchObject({
      query_hash: hashRetrievalValue(TEST_QUERY),
      query_length: TEST_QUERY.length,
      status: RETRIEVAL_RUN_STATUS.SUCCEEDED,
      candidate_count: evidence.length,
      selected_evidence_count: 20,
      context_character_count: 800,
    });
    expect(JSON.stringify(run)).not.toContain(TEST_QUERY);

    const storedEvidence = await db
      .select()
      .from(retrievalEvidence)
      .where(eq(retrievalEvidence.retrieval_run_id, runId))
      .orderBy(asc(retrievalEvidence.retrieval_rank));
    expect(storedEvidence).toHaveLength(20);
    expect(JSON.stringify(storedEvidence)).not.toContain("private chunk");
  });
});
