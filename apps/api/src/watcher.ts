import { promises as fs } from "node:fs";
import path from "node:path";

import { createEmbeddingProvider } from "@llm-wiki/ai";
import { ingestMarkdown } from "@llm-wiki/core";
import { createDbClient } from "@llm-wiki/db";
import { startVaultWatcher, type WatchEvent } from "@llm-wiki/obsidian";

import type { AppConfig } from "./config";

export type WatcherHandle = {
  stop: () => Promise<void>;
};

export function startIngestionWatcher(config: AppConfig): WatcherHandle {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required to start ingestion watcher");
  }

  const { db } = createDbClient(config.databaseUrl);
  const embeddingProvider = createEmbeddingProvider({
    provider: config.embeddingProvider,
    geminiGeap: {
      projectId: config.gcpProjectId,
      location: config.gcpLocation
    }
  });

  const rootPath = path.resolve(config.vaultPath);

  const stop = startVaultWatcher({
    rootPath,
    debounceMs: config.watcherDebounceMs,
    onEvent: async (event: WatchEvent) => {
      if (event.event === "unlink") {
        console.warn("Skipping unlink event; delete handling not implemented", event.path);
        return;
      }

      const rawContent = await fs.readFile(event.path, "utf8");
      const relative = path.relative(rootPath, event.path);
      if (relative.startsWith("..")) {
        throw new Error(`Watcher event outside vault root: ${event.path}`);
      }

      const vaultPath = path.join("human", relative).replace(/\\/g, "/");
      await ingestMarkdown(
        {
          db,
          options: {
            embeddingProvider,
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
    }
  });

  return { stop };
}
