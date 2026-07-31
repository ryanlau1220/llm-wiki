import { describe, expect, test } from "bun:test";

import { ASK_EVALUATION_TARGET, ASK_PROMPT_VERSION, buildAskJsonRepairPrompt, buildAskSystemInstruction, buildAskWorkflowManifest, repairOutputTokenBudget } from "./ask";

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

  test("freezes the Ask/RAG target identity into an evaluation manifest", () => {
    const manifest = buildAskWorkflowManifest(
      { embeddingProvider: "fallback", llmProvider: "ollama", ollamaLlmModel: "local-judge" } as any,
      8,
    );

    expect(manifest).toMatchObject({
      target: ASK_EVALUATION_TARGET,
      targetVersion: ASK_PROMPT_VERSION,
      policy: "vault_hybrid",
      topK: 8,
      modelProvider: "ollama",
      modelName: "local-judge",
    });
  });

  test("retries malformed structured output with a bounded, schema-only request", () => {
    expect(buildAskJsonRepairPrompt("Original request")).toContain("Return only one complete JSON object");
    expect(buildAskJsonRepairPrompt("Original request")).not.toContain("previous response:");
    expect(repairOutputTokenBudget(384)).toBe(768);
    expect(repairOutputTokenBudget(1_024)).toBe(1_024);
  });
});
