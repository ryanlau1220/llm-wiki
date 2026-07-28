import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import type { LLMProvider } from "@llm-wiki/ai";

import { refactorNotePreview } from "./refactor";
import type { AppConfig } from "./config";

const temporaryVaults: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryVaults.splice(0).map((vaultPath) => rm(vaultPath, { recursive: true, force: true })));
});

function createConfig(vaultPath: string): AppConfig {
  return {
    apiPort: 3001,
    embeddingProvider: "fallback",
    jwtSecret: "test-secret",
    vaultPath,
    watcherDebounceMs: 0,
    embeddingVersion: "test",
    semanticDuplicateThreshold: 0.92,
    semanticDuplicateCandidates: 10,
  };
}

test("refactor preview uses an injected provider and preserves the source path", async () => {
  const vaultPath = await mkdtemp(path.join(tmpdir(), "llm-wiki-refactor-"));
  temporaryVaults.push(vaultPath);
  await writeFile(path.join(vaultPath, "messy.md"), "# Rough note\n\nA short idea about retrieval.");

  const llmProvider: LLMProvider = {
    generate: async () => ({
      text: JSON.stringify({
        refactored_note: {
          title: "Retrieval overview",
          content: "# Retrieval overview\n\n## Summary\n\nA short idea about retrieval.",
          tags: ["retrieval"],
          links: [],
        },
      }),
    }),
  };

  const result = await refactorNotePreview(createConfig(vaultPath), "messy.md", { llmProvider });

  expect(result).toMatchObject({
    sourcePath: "messy.md",
    originalContent: "# Rough note\n\nA short idea about retrieval.",
    note: { title: "Retrieval overview", tags: ["retrieval"] },
  });
});
