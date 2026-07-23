import { describe, expect, mock, test } from "bun:test";

import type { EmbeddingProvider, LLMProvider } from "@llm-wiki/ai";
import type { DbClient } from "@llm-wiki/db";

import { ingestMarkdown } from "./ingest";
import type { IngestionDependencies } from "./types";
import { hashContent } from "./utils";

const EMBEDDING_DIMENSIONS = 768;
const FIXED_NOW = new Date("2026-05-01T00:00:00Z");

type InsertValues = Record<string, unknown> | Array<Record<string, unknown>>;

function createIngestionDependencies(options?: {
  selectResults?: Array<Array<Record<string, unknown>>>;
  generate?: () => Promise<{ text: string }>;
}) {
  const selectResults = [...(options?.selectResults ?? [])];
  const insertedValues: InsertValues[] = [];
  const transaction = mock(async (callback: (tx: DbClient) => Promise<unknown>) => callback(db));

  const db = {
    transaction,
    select: mock(() => {
      const rows = selectResults.shift() ?? [];
      const result = Object.assign(rows, { limit: () => rows });
      const query = {
        from: () => query,
        where: () => result,
      };

      return query;
    }),
    insert: mock(() => ({
      values: (values: InsertValues) => {
        insertedValues.push(values);
        return { returning: () => [{ id: "doc-1", version: 1 }] };
      },
    })),
    update: mock(() => ({ set: () => ({ where: () => undefined }) })),
    delete: mock(() => ({ where: () => undefined })),
  } as unknown as DbClient;

  const embeddingProvider = {
    embed: mock(async () => ({
      vectors: [
        Array.from({ length: EMBEDDING_DIMENSIONS }, (__, index) => (index === 0 ? 0.1 : 0)),
      ],
      model: { model: "test-model" },
    })),
  };
  const llmProvider = {
    generate: mock(options?.generate ?? (async () => ({ text: "0.8" }))),
  };

  return {
    deps: {
      db,
      options: {
        embeddingProvider: embeddingProvider as unknown as EmbeddingProvider,
        llmProvider: llmProvider as LLMProvider,
        embeddingVersion: "v1",
        now: () => FIXED_NOW,
      },
    } satisfies IngestionDependencies,
    embeddingProvider,
    insertedValues,
    llmProvider,
    transaction,
  };
}

const INPUT = {
  vaultPath: "human/test.md",
  rawContent: "# Test\nHello World",
  sourceKind: "human" as const,
  isAiGenerated: false,
};

describe("ingestMarkdown", () => {
  test("waits for coherence scoring before opening the write transaction", async () => {
    let resolveScore: (value: { text: string }) => void = () => undefined;
    const scorePromise = new Promise<{ text: string }>((resolve) => {
      resolveScore = resolve;
    });
    const { deps, llmProvider, transaction } = createIngestionDependencies({
      generate: () => scorePromise,
    });

    const ingestion = ingestMarkdown(deps, INPUT);
    await Promise.resolve();

    expect(llmProvider.generate).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();

    resolveScore({ text: "0.8" });

    await expect(ingestion).resolves.toMatchObject({
      status: "created",
      documentId: "doc-1",
    });
  });

  test("persists deterministic quality metrics when coherence scoring fails", async () => {
    const { deps, insertedValues, transaction } = createIngestionDependencies({
      generate: async () => {
        throw new Error("provider unavailable");
      },
    });

    await expect(ingestMarkdown(deps, INPUT)).resolves.toMatchObject({
      status: "created",
      documentId: "doc-1",
    });

    expect(transaction).toHaveBeenCalledTimes(1);

    const documentInsert = insertedValues.find(
      (values): values is Record<string, unknown> =>
        !Array.isArray(values) && values.path === INPUT.vaultPath,
    );

    expect(documentInsert).toBeDefined();
    expect(documentInsert?.quality_metrics).toEqual({
      linkDensity: 0,
      completeness: 0,
      wordCount: 4,
    });
    expect(documentInsert?.quality_score).toBe(0);
    expect(documentInsert?.health_score).toBe(0);
  });

  test("skips unchanged content without requesting coherence scoring", async () => {
    const { deps, llmProvider, transaction } = createIngestionDependencies({
      selectResults: [[{ id: "doc-1", version: 2, content_hash: hashContent("unchanged") }]],
    });

    await expect(
      ingestMarkdown(deps, {
        ...INPUT,
        rawContent: "unchanged",
      }),
    ).resolves.toMatchObject({
      status: "skipped",
      documentId: "doc-1",
      version: 2,
    });

    expect(llmProvider.generate).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
