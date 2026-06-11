import { promises as fs } from "node:fs";
import path from "node:path";

import { createEmbeddingProvider } from "@llm-wiki/ai";
import { ingestMarkdown } from "@llm-wiki/core";
import { createDbClient } from "@llm-wiki/db";

import type { AppConfig } from "./config";
import { sseEmitter } from "./events";

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

  const rootPath = path.resolve(config.vaultPath);
  const normalizedRelative = path.normalize(relativePath).replace(/^\/+/, "");
  const filePath = path.resolve(rootPath, normalizedRelative);
  const relative = path.relative(rootPath, filePath);

  if (relative.startsWith("..") || relative.split(path.sep).some((part) => part.startsWith("."))) {
    throw new Error("Reindex path must be inside vault root and cannot be in hidden folders");
  }

  const vaultPath = relative.replace(/\\/g, "/");
  const rawContent = await fs.readFile(filePath, "utf8");

  const { parseMarkdownDocument } = await import("@llm-wiki/obsidian");
  const parsed = parseMarkdownDocument(rawContent);
  const isAiGenerated = parsed.metadata.is_ai_generated === true || 
                        parsed.metadata.type === "ai_refactored" || 
                        parsed.metadata.type === "ai_generated";
  const sourceKind = (parsed.metadata.source_kind as any) || (isAiGenerated ? "ai" : "human");

  const { db } = createDbClient(config.databaseUrl);
  const embeddingProvider = createEmbeddingProvider({
    provider: config.embeddingProvider,
    geminiGeap: {
      projectId: config.gcpProjectId,
      location: config.gcpLocation,
      model: config.gcpEmbeddingModel
    },
    openai: {
      apiKey: config.openaiApiKey,
      baseUrl: config.openaiBaseUrl,
      model: config.openaiEmbeddingModel
    }
  });
  
  const { createLLMProvider } = await import("@llm-wiki/ai");
  const llmProvider = createLLMProvider({
    provider: config.embeddingProvider,
    geminiGeap: {
      projectId: config.gcpProjectId,
      location: config.gcpLocation,
      model: config.gcpLlmModel
    },
    openai: {
      apiKey: config.openaiApiKey,
      baseUrl: config.openaiBaseUrl,
      model: config.openaiLlmModel
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

  sseEmitter.emit("change", { type: "note_changed", path: vaultPath });

  return {
    vaultPath,
    ...result
  };
}
