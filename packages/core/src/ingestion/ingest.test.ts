import { expect, test, describe, mock } from "bun:test";
import { ingestMarkdown } from "./ingest";

describe("Ingestion Flow", () => {
  test("ingestMarkdown should handle successful ingestion", async () => {
    const mockDb = {
      transaction: async (cb: any) => cb(mockDb),
      select: mock(() => ({ from: () => ({ where: () => ({ limit: () => [] }) }) })),
      insert: mock(() => ({ values: () => ({ returning: () => [{ id: "doc-1", version: 1 }] }) })),
      update: mock(() => ({ set: () => ({ where: () => {} }) })),
      delete: mock(() => ({ where: () => {} })),
      execute: mock(async () => {}),
    };

    const mockEmbeddingProvider = {
      embed: mock(async () => ({
        vectors: [[0.1, 0.2]],
        model: { model: "test-model" }
      }))
    };

    const deps = {
      db: mockDb as any,
      options: {
        embeddingProvider: mockEmbeddingProvider as any,
        embeddingVersion: "v1",
        now: () => new Date("2026-05-01T00:00:00Z")
      }
    };

    const input = {
      vaultPath: "human/test.md",
      rawContent: "# Test\nHello World",
      sourceKind: "human" as const,
      isAiGenerated: false
    };

    const result = await ingestMarkdown(deps, input);

    expect(result.status).toBe("created");
    expect(result.documentId).toBe("doc-1");
    expect(mockEmbeddingProvider.embed).toHaveBeenCalled();
    expect(mockDb.insert).toHaveBeenCalled();
  });
});
