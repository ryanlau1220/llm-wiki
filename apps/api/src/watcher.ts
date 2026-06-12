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

  const vaultRoot = path.resolve(config.vaultPath);

  // Ensure vault root folder exists
  await fs.mkdir(vaultRoot, { recursive: true });

  const allFiles = await getMarkdownFiles(vaultRoot);
  const markdownFiles = allFiles.filter((filePath) => {
    const relative = path.relative(vaultRoot, filePath);
    // Ignore any path segment starting with a dot (like .obsidian or .llm-wiki)
    return !relative.split(path.sep).some((part) => part.startsWith("."));
  });

  const activePaths = new Set<string>();

  const deps = {
    db,
    options: {
      embeddingProvider,
      llmProvider,
      embeddingVersion: config.embeddingVersion
    }
  };

  // Ingest notes from the vault root
  for (const filePath of markdownFiles) {
    try {
      const relative = path.relative(vaultRoot, filePath);
      const vaultPath = relative.replace(/\\/g, "/");
      activePaths.add(vaultPath);

      const rawContent = await fs.readFile(filePath, "utf8");
      
      const { parseMarkdownDocument } = await import("@llm-wiki/obsidian");
      const parsed = parseMarkdownDocument(rawContent);
      const isAiGenerated = parsed.metadata.is_ai_generated === true || 
                            parsed.metadata.type === "ai_refactored" || 
                            parsed.metadata.type === "ai_generated";
      const sourceKind = (parsed.metadata.source_kind as any) || (isAiGenerated ? "ai" : "human");

      await ingestMarkdown(deps, {
        vaultPath,
        rawContent,
        sourceKind,
        isAiGenerated
      });
    } catch (error) {
      logger.error(`Failed to ingest note ${filePath}`, error);
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

  const rootPath = path.resolve(config.vaultPath);

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
        if (relative.startsWith("..") || relative.split(path.sep).some((part) => part.startsWith("."))) {
          // Ignore any file events outside the vault or in hidden folders (.obsidian, .llm-wiki)
          return;
        }

        const vaultPath = relative.replace(/\\/g, "/");

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
        const { parseMarkdownDocument } = await import("@llm-wiki/obsidian");
        const parsed = parseMarkdownDocument(rawContent);
        const isAiGenerated = parsed.metadata.is_ai_generated === true || 
                              parsed.metadata.type === "ai_refactored" || 
                              parsed.metadata.type === "ai_generated";
        const sourceKind = (parsed.metadata.source_kind as any) || (isAiGenerated ? "ai" : "human");

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
