import { promises as fs } from "node:fs";
import path from "node:path";

import { createEmbeddingProvider } from "@llm-wiki/ai";
import { deleteDocumentByPath, ingestMarkdown } from "@llm-wiki/core";
import { createDbClient } from "@llm-wiki/db";
import { startVaultWatcher, type WatchEvent } from "@llm-wiki/obsidian";

import type { AppConfig } from "./config";

export type WatcherHandle = {
  stop: () => Promise<void>;
};

import { createLogger } from "@llm-wiki/core";

export async function startIngestionWatcher(config: AppConfig): Promise<WatcherHandle> {
  const logger = createLogger("watcher");

  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required to start ingestion watcher");
  }

  const { db } = createDbClient(config.databaseUrl);
  const embeddingProvider = createEmbeddingProvider({
    provider: config.embeddingProvider,
    geminiGeap: {
      projectId: config.gcpProjectId,
      location: config.gcpLocation
    },
    ollama: {
      baseUrl: config.ollamaBaseUrl,
      model: config.ollamaEmbeddingModel
    }
  });

  const { createLLMProvider } = await import("@llm-wiki/ai");
  const llmProvider = createLLMProvider({
    provider: config.embeddingProvider as any,
    geminiGeap: {
      projectId: config.gcpProjectId,
      location: config.gcpLocation
    },
    ollama: {
      baseUrl: config.ollamaBaseUrl,
      model: config.ollamaLlmModel
    }
  });

  const rootPath = path.resolve(config.vaultPath);

  logger.info("Starting ingestion watcher", { rootPath, debounceMs: config.watcherDebounceMs });

  const stop = startVaultWatcher({
    rootPath,
    debounceMs: config.watcherDebounceMs,
    onEvent: async (event: WatchEvent) => {
      try {
        const relative = path.relative(rootPath, event.path);
        if (relative.startsWith("..")) {
          throw new Error(`Watcher event outside vault root: ${event.path}`);
        }

        const vaultPath = path.join("human", relative).replace(/\\/g, "/");

        logger.debug("Watcher event received", { event: event.event, path: vaultPath });

        if (event.event === "unlink") {
          await deleteDocumentByPath(
            {
              db,
              options: {
                embeddingProvider,
                llmProvider,
                embeddingVersion: config.embeddingVersion
              }
            },
            vaultPath
          );
          logger.info("Document deleted", { path: vaultPath });
          return;
        }

        const rawContent = await fs.readFile(event.path, "utf8");
        await ingestMarkdown(
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
            sourceKind: "human",
            isAiGenerated: false
          }
        );
        logger.info("Document ingested", { path: vaultPath });
      } catch (error) {
        logger.error("Watcher event processing failed", error, { event: event.event, path: event.path });
      }
    }
  });

  return { stop };
}
