import { afterEach, describe, expect, test } from "bun:test";
import type { EmbeddingProvider } from "@llm-wiki/ai";
import { chunks, createDbClient, documents, EMBEDDING_DIMENSIONS } from "@llm-wiki/db";
import { inArray } from "drizzle-orm";

import { hybridRetrieve } from "./hybrid";

const DATABASE_URL = process.env.DATABASE_URL;
const describeWithDatabase = DATABASE_URL ? describe : describe.skip;
const FIXTURE_PATHS = [
  "retrieval-filter-fixtures/included.md",
  "retrieval-filter-fixtures/excluded.md",
];
const FILTERED_DOCUMENT_QUERY = "selective retrieval filtering";

describeWithDatabase("hybrid retrieval metadata filters", () => {
  afterEach(async () => {
    const { db } = createDbClient(DATABASE_URL!);
    await db.delete(documents).where(inArray(documents.path, FIXTURE_PATHS));
  });

  test("binds document ID and path-prefix filters to vector and lexical candidates", async () => {
    const { db } = createDbClient(DATABASE_URL!);
    const [includedDocument, excludedDocument] = await db
      .insert(documents)
      .values([
        fixtureDocument(FIXTURE_PATHS[0]!, "Included retrieval fixture"),
        fixtureDocument(FIXTURE_PATHS[1]!, "Excluded retrieval fixture"),
      ])
      .returning({ id: documents.id, path: documents.path });

    await db
      .insert(chunks)
      .values([
        fixtureChunk(
          includedDocument!.id,
          "Selective retrieval filtering keeps this intended document in the result set.",
          0,
        ),
        fixtureChunk(
          includedDocument!.id,
          "Selective retrieval filtering also keeps a second intended chunk without diversity enabled.",
          1,
        ),
        fixtureChunk(
          excludedDocument!.id,
          "Selective retrieval filtering must not return this excluded document.",
          0,
        ),
      ]);

    const response = await hybridRetrieve(
      { db, embeddingProvider: new FixedEmbeddingProvider() },
      {
        query: FILTERED_DOCUMENT_QUERY,
        topK: 2,
        filters: {
          documentIds: [includedDocument!.id],
          pathPrefix: "retrieval-filter-fixtures",
        },
      },
    );

    expect(response.chunks).not.toHaveLength(0);
    expect(response.chunks).toHaveLength(2);
    expect(response.chunks.every((chunk) => chunk.documentId === includedDocument!.id)).toBe(true);
    expect(response.chunks.every((chunk) => chunk.documentPath === FIXTURE_PATHS[0]!)).toBe(true);
  });
});

function fixtureDocument(path: string, title: string) {
  return {
    path,
    title,
    type: "retrieval-filter-fixture",
    content: title,
    content_hash: `retrieval-filter-${title.toLocaleLowerCase().replaceAll(" ", "-")}`,
    source_kind: "test",
    is_ai_generated: false,
  };
}

function fixtureChunk(documentId: string, text: string, chunkIndex: number) {
  return {
    document_id: documentId,
    chunk_index: chunkIndex,
    text,
    embedding: vectorAt(0),
    embedding_model: "test-model",
    embedding_version: "test-v1",
    source_start_offset: 0,
    source_end_offset: text.length,
  };
}

function vectorAt(index: number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, currentIndex) =>
    currentIndex === index ? 1 : 0,
  );
}

class FixedEmbeddingProvider implements EmbeddingProvider {
  readonly name = "test";
  readonly model = "test-model";

  async embed(request: { texts: string[] }) {
    return {
      vectors: request.texts.map(() => vectorAt(0)),
      model: { provider: this.name, model: this.model, dimensions: EMBEDDING_DIMENSIONS },
    };
  }
}
