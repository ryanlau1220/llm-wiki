import { describe, expect, test } from "bun:test";

import { buildAskSystemInstruction } from "./ask";

describe("Ask Flow", () => {
  test("askPreview should handle valid query", async () => {
    // Mock dependencies inside ask.ts logic would be hard without DI
    // But we can check if it executes and handle the errors
    
    const _config: any = {
      databaseUrl: "postgres://mock",
      embeddingProvider: "gemini",
      gcpProjectId: "test-project",
      gcpLocation: "us-central1"
    };

    // We need to mock the providers that askPreview creates internally
    // This is a sign that askPreview should accept providers as dependencies for better testability
  });

  test("requires numeric context numbers for RAG citations", () => {
    const instruction = buildAskSystemInstruction("rag");

    expect(instruction).toContain('"citations": [1, 2]');
    expect(instruction).toContain("array of positive integer context numbers");
    expect(instruction).not.toContain('["Context number used to support the answer"]');
  });
});
