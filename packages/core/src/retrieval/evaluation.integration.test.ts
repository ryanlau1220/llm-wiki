import { afterEach, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";

import type { EmbeddingProvider } from "@llm-wiki/ai";
import { EMBEDDING_DIMENSIONS, chunks, createDbClient, documents } from "@llm-wiki/db";

import { evaluateRetrieval, type RetrievalEvaluationCase } from "./evaluation";
import { hybridRetrieve } from "./hybrid";

const DATABASE_URL = process.env.DATABASE_URL;
const describeWithDatabase = DATABASE_URL ? describe : describe.skip;
const EVALUATION_K = 2;
const FIXTURE_PATHS = [
  "evaluation-fixtures/extension-pairing.md",
  "evaluation-fixtures/retrieval-tracing.md",
  "evaluation-fixtures/distractor.md",
];
const BASELINE_CASES: RetrievalEvaluationCase[] = [
  {
    id: "extension-pairing",
    query: "How does local extension pairing work?",
    relevant: [{ documentPath: FIXTURE_PATHS[0]!, chunkIndex: 0 }],
  },
  {
    id: "retrieval-tracing",
    query: "What is bounded retrieval tracing?",
    relevant: [{ documentPath: FIXTURE_PATHS[1]!, chunkIndex: 0 }],
  },
];
const VECTOR_BY_QUERY = new Map<string, number>([
  [BASELINE_CASES[0]!.query, 0],
  [BASELINE_CASES[1]!.query, 1],
]);

describeWithDatabase("hybrid retrieval baseline evaluation", () => {
  afterEach(async () => {
    const { db } = createDbClient(DATABASE_URL!);
    await db.delete(documents).where(inArray(documents.path, FIXTURE_PATHS));
  });

  test("retrieves each known relevant fixture within the evaluation budget", async () => {
    const { db } = createDbClient(DATABASE_URL!);
    await seedEvaluationFixtures(db);
    const embeddingProvider = new BaselineEmbeddingProvider();
    const retrievedByCase = new Map<string, Array<{ documentPath: string; chunkIndex: number }>>();

    for (const evaluationCase of BASELINE_CASES) {
      const response = await hybridRetrieve(
        { db, embeddingProvider },
        { query: evaluationCase.query, topK: EVALUATION_K },
      );
      retrievedByCase.set(evaluationCase.id, response.chunks);
    }

    const metrics = evaluateRetrieval(BASELINE_CASES, retrievedByCase, EVALUATION_K);
    if (process.env.RETRIEVAL_EVALUATION_REPORT === "true") {
      console.info(JSON.stringify({ evaluation: "hybrid-baseline", metrics }));
    }

    expect(metrics).toMatchObject({
      evaluatedCaseCount: BASELINE_CASES.length,
      k: EVALUATION_K,
      recallAtK: 1,
      meanReciprocalRank: 1,
      ndcgAtK: 1,
    });
  });
});

async function seedEvaluationFixtures(db: ReturnType<typeof createDbClient>["db"]): Promise<void> {
  const now = new Date();
  const insertedDocuments = await db
    .insert(documents)
    .values([
      createFixtureDocument(FIXTURE_PATHS[0]!, "Local extension pairing", now),
      createFixtureDocument(FIXTURE_PATHS[1]!, "Bounded retrieval tracing", now),
      createFixtureDocument(FIXTURE_PATHS[2]!, "Unrelated fixture", now),
    ])
    .returning({ id: documents.id, path: documents.path });
  const documentIdByPath = new Map(insertedDocuments.map((document) => [document.path, document.id]));

  await db.insert(chunks).values([
    createFixtureChunk(
      documentIdByPath.get(FIXTURE_PATHS[0]!)!,
      "A local extension pairing code establishes an explicit browser connection.",
      0,
    ),
    createFixtureChunk(
      documentIdByPath.get(FIXTURE_PATHS[1]!)!,
      "Bounded retrieval tracing stores hashes and ranked evidence references.",
      1,
    ),
    createFixtureChunk(
      documentIdByPath.get(FIXTURE_PATHS[2]!)!,
      "A distractor note does not answer either evaluation question.",
      2,
    ),
  ]);
}

function createFixtureDocument(path: string, title: string, now: Date) {
  return {
    path,
    title,
    type: "evaluation-fixture",
    content: title,
    content_hash: `evaluation-${title.toLowerCase().replaceAll(" ", "-")}`,
    source_kind: "evaluation",
    is_ai_generated: false,
    created_at: now,
    updated_at: now,
  };
}

function createFixtureChunk(documentId: string, text: string, vectorIndex: number) {
  return {
    document_id: documentId,
    chunk_index: 0,
    text,
    embedding: vectorAt(vectorIndex),
    embedding_model: "evaluation-model",
    embedding_version: "evaluation-v1",
    source_start_offset: 0,
    source_end_offset: text.length,
  };
}

function vectorAt(index: number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, currentIndex) => (
    currentIndex === index ? 1 : 0
  ));
}

class BaselineEmbeddingProvider implements EmbeddingProvider {
  readonly name = "evaluation";
  readonly model = "evaluation-model";

  async embed(request: { texts: string[] }) {
    return {
      vectors: request.texts.map((text) => vectorAt(VECTOR_BY_QUERY.get(text) ?? 2)),
      model: { provider: this.name, model: this.model, dimensions: EMBEDDING_DIMENSIONS },
    };
  }
}
