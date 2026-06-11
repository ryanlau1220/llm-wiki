import { promises as fs } from "node:fs";
import path from "node:path";

import { createEmbeddingProvider } from "@llm-wiki/ai";
import { deleteDocumentByPath, ingestMarkdown } from "@llm-wiki/core";
import { createDbClient, documents } from "@llm-wiki/db";
import { startVaultWatcher, type WatchEvent } from "@llm-wiki/obsidian";

import type { AppConfig } from "./config";
import { sseEmitter } from "./events";

export type WatcherHandle = {
  stop: () => Promise<void>;
};

import { createLogger } from "@llm-wiki/core";

// Recursive walk function to find all markdown files
async function getMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await getMarkdownFiles(fullPath)));
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore if directory doesn't exist yet
  }
  return files;
}

export async function syncVault(
  config: AppConfig,
  db: any,
  embeddingProvider: any,
  llmProvider: any
): Promise<void> {
  const logger = createLogger("sync");
  logger.info("Starting startup vault synchronization...");

  const humanRoot = path.resolve(config.vaultPath);
  const aiRoot = path.resolve(config.vaultPath, "..", "ai-generated");

  // Ensure vault folders exist
  await fs.mkdir(humanRoot, { recursive: true });
  await fs.mkdir(aiRoot, { recursive: true });

  const humanFiles = await getMarkdownFiles(humanRoot);
  const aiFiles = await getMarkdownFiles(aiRoot);

  const activePaths = new Set<string>();

  const deps = {
    db,
    options: {
      embeddingProvider,
      llmProvider,
      embeddingVersion: config.embeddingVersion
    }
  };

  // Ingest human notes
  for (const filePath of humanFiles) {
    try {
      const relative = path.relative(humanRoot, filePath);
      const vaultPath = path.join("human", relative).replace(/\\/g, "/");
      activePaths.add(vaultPath);

      const rawContent = await fs.readFile(filePath, "utf8");
      await ingestMarkdown(deps, {
        vaultPath,
        rawContent,
        sourceKind: "human",
        isAiGenerated: false
      });
    } catch (error) {
      logger.error(`Failed to ingest human note ${filePath}`, error);
    }
  }

  // Ingest AI-generated notes
  for (const filePath of aiFiles) {
    try {
      const relative = path.relative(aiRoot, filePath);
      const vaultPath = path.join("ai-generated", relative).replace(/\\/g, "/");
      activePaths.add(vaultPath);

      const rawContent = await fs.readFile(filePath, "utf8");
      await ingestMarkdown(deps, {
        vaultPath,
        rawContent,
        sourceKind: "ai",
        isAiGenerated: true
      });
    } catch (error) {
      logger.error(`Failed to ingest AI note ${filePath}`, error);
    }
  }

  // Find obsolete records in DB and delete them
  try {
    const dbDocs = await db.select({ id: documents.id, path: documents.path }).from(documents);
    for (const doc of dbDocs) {
      if (!activePaths.has(doc.path)) {
        logger.info(`Deleting obsolete database record: ${doc.path}`);
        await deleteDocumentByPath(deps, doc.path);
      }
    }
  } catch (error) {
    logger.error("Failed to clean up obsolete database records", error);
  }

  // Resolve all vault links globally
  try {
    const { resolveAllLinks } = await import("@llm-wiki/core");
    logger.info("Resolving all wiki links...");
    await resolveAllLinks(db);
  } catch (error) {
    logger.error("Failed to resolve links during sync", error);
  }

  logger.info("Startup vault synchronization completed.");
}

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
      location: config.gcpLocation,
      model: config.gcpEmbeddingModel
    },
    ollama: {
      baseUrl: config.ollamaBaseUrl,
      model: config.ollamaEmbeddingModel
    },
    openai: {
      apiKey: config.openaiApiKey,
      baseUrl: config.openaiBaseUrl,
      model: config.openaiEmbeddingModel
    }
  });

  const { createLLMProvider } = await import("@llm-wiki/ai");
  const llmProvider = createLLMProvider({
    provider: config.embeddingProvider as any,
    geminiGeap: {
      projectId: config.gcpProjectId,
      location: config.gcpLocation,
      model: config.gcpLlmModel
    },
    ollama: {
      baseUrl: config.ollamaBaseUrl,
      model: config.ollamaLlmModel
    },
    openai: {
      apiKey: config.openaiApiKey,
      baseUrl: config.openaiBaseUrl,
      model: config.openaiLlmModel
    }
  });

  const rootPath = path.resolve(config.vaultPath, "..");

  logger.info("Starting ingestion watcher", { rootPath, debounceMs: config.watcherDebounceMs });

  // Run startup synchronization
  await syncVault(config, db, embeddingProvider, llmProvider);

  const stop = startVaultWatcher({
    rootPath,
    debounceMs: config.watcherDebounceMs,
    ignoredGlobs: ["**/.*/**", "**/.*"],
    onEvent: async (event: WatchEvent) => {
      try {
        const relative = path.relative(rootPath, event.path);
        if (relative.startsWith("..")) {
          throw new Error(`Watcher event outside vault root: ${event.path}`);
        }

        const vaultPath = relative.replace(/\\/g, "/");
        const parts = vaultPath.split("/");
        const folder = parts[0];

        if (folder !== "human" && folder !== "ai-generated") {
          // Ignore files outside human/ and ai-generated/ folders (e.g. .obsidian config)
          return;
        }

        const sourceKind = folder === "human" ? "human" : "ai";
        const isAiGenerated = folder === "ai-generated";

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
          sseEmitter.emit("change", { type: "note_changed", path: vaultPath });
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
            sourceKind,
            isAiGenerated
          }
        );
        logger.info("Document ingested", { path: vaultPath });
        sseEmitter.emit("change", { type: "note_changed", path: vaultPath });
      } catch (error) {
        logger.error("Watcher event processing failed", error, { event: event.event, path: event.path });
      }
    }
  });

  return { stop };
}
