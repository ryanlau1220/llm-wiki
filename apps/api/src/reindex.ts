import { promises as fs } from "node:fs";
import path from "node:path";

import { createEmbeddingProvider } from "@llm-wiki/ai";
import { ingestMarkdown } from "@llm-wiki/core";
import { createDbClient } from "@llm-wiki/db";

import type { AppConfig } from "./config";

export type ReindexResult = {
  vaultPath: string;
  status: "created" | "updated" | "skipped" | "failed";
  documentId?: string;
  version?: number;
  error?: string;
};

export async function reindexFile(config: AppConfig, relativePath: string): Promise<ReindexResult> {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required to reindex");
  }

  const rootPath = path.resolve(config.vaultPath, "..");
  const normalizedRelative = path.normalize(relativePath).replace(/^\/+/, "");
  const filePath = path.resolve(rootPath, normalizedRelative);
  const relative = path.relative(rootPath, filePath);

  if (relative.startsWith("..")) {
    throw new Error("Reindex path must be inside vault root");
  }

  const vaultPath = relative.replace(/\\/g, "/");
  const parts = vaultPath.split("/");
  const folder = parts[0];
  if (folder !== "human" && folder !== "ai-generated") {
    throw new Error(`Invalid vault path directory: ${folder}`);
  }

  const sourceKind = folder === "human" ? "human" : "ai";
  const isAiGenerated = folder === "ai-generated";

  const rawContent = await fs.readFile(filePath, "utf8");

  const { db } = createDbClient(config.databaseUrl);
  const embeddingProvider = createEmbeddingProvider({
    provider: config.embeddingProvider,
    geminiGeap: {
      projectId: config.gcpProjectId,
      location: config.gcpLocation,
      model: config.gcpEmbeddingModel
    }
  });
  
  const { createLLMProvider } = await import("@llm-wiki/ai");
  const llmProvider = createLLMProvider({
    provider: config.embeddingProvider,
    geminiGeap: {
      projectId: config.gcpProjectId,
      location: config.gcpLocation,
      model: config.gcpLlmModel
    }
  });

  const result = await ingestMarkdown(
    {
      db,
      options: {
        embeddingProvider,
        llmProvider,
        embeddingVersion: config.embeddingVersion
      }
    },
    {
      vaultPath,
      rawContent,
      sourceKind,
      isAiGenerated
    }
  );

  return {
    vaultPath,
    ...result
  };
}
