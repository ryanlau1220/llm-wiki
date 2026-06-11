import { expect, test, describe, mock } from "bun:test";
import { ingestMarkdown } from "./ingest";

describe("Ingestion Flow", () => {
  test("ingestMarkdown should handle successful ingestion", async () => {
    const mockDbChain = {
      from: () => mockDbChain,
      where: () => {
        const res: any = [];
        res.limit = () => [];
        return res;
      },
    };

    const mockDb = {
      transaction: async (cb: any) => cb(mockDb),
      select: mock(() => mockDbChain),
      insert: mock(() => ({ values: () => ({ returning: () => [{ id: "doc-1", version: 1 }] }) })),
      update: mock(() => ({ set: () => ({ where: () => {} }) })),
      delete: mock(() => ({ where: () => {} })),
      execute: mock(async () => {}),
    };

    const mockEmbeddingProvider = {
      embed: mock(async () => ({
        vectors: [Array.from({ length: 768 }, (_, i) => (i === 0 ? 0.1 : 0))],
        model: { model: "test-model" }
      }))
    };

    const mockLlmProvider = {
      generate: mock(async () => ({ text: "10" }))
    };

    const deps = {
      db: mockDb as any,
      options: {
        embeddingProvider: mockEmbeddingProvider as any,
        llmProvider: mockLlmProvider as any,
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
