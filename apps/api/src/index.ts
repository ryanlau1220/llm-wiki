import { Elysia } from "elysia";

import { askPreview, confirmAskSave } from "./ask";
import { loadConfig } from "./config";
import { reindexFile } from "./reindex";
import { startIngestionWatcher } from "./watcher";

const config = loadConfig();

import { promises as fs } from "node:fs";
import { createDbClient } from "@llm-wiki/db";

const app = new Elysia()
  .get("/health", async () => {
    const health: any = {
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        api: "ok"
      }
    };

    // Check DB
    try {
      const { db } = createDbClient(config.databaseUrl!);
      await db.execute("SELECT 1");
      health.services.database = "ok";
    } catch (e) {
      health.status = "error";
      health.services.database = "error";
    }

    // Check Vault
    try {
      await fs.access(config.vaultPath);
      health.services.vault = "ok";
    } catch (e) {
      health.status = "error";
      health.services.vault = "error";
    }

    return health;
  })
  .get("/", () => ({
    message: "LLM Wiki API is running"
  }))
  .post("/ask/preview", async ({ body }) => {
    const payload = body as { query?: string; topK?: number };
    if (!payload?.query) {
      return {
        error: "query is required"
      };
    }

    return askPreview(config, payload.query, payload.topK);
  })
  .post("/ask/confirm", async ({ body }) => {
    const payload = body as { requestId?: string; note?: { title?: string; content?: string; links?: string[]; tags?: string[] } };
    if (!payload?.requestId || !payload?.note?.title || !payload?.note?.content) {
      return {
        error: "requestId and note.title/content are required"
      };
    }

    return confirmAskSave(config, payload.requestId, payload.note);
  })
  .post("/reindex", async ({ body }) => {
    const payload = body as { path?: string };
    if (!payload?.path) {
      return {
        error: "path is required"
      };
    }

    const result = await reindexFile(config, payload.path);
    return result;
  })
  .post("/refactor/preview", async ({ body }) => {
    const payload = body as { path?: string };
    if (!payload?.path) {
      return {
        error: "path is required"
      };
    }

    const { refactorNotePreview } = await import("./refactor");
    return refactorNotePreview(config, payload.path);
  })
  .post("/refactor/confirm", async ({ body }) => {
    const payload = body as { requestId?: string; sourcePath?: string; note?: { title?: string; content?: string; links?: string[]; tags?: string[] } };
    if (!payload?.requestId || !payload?.sourcePath || !payload?.note?.title || !payload?.note?.content) {
      return {
        error: "requestId, sourcePath and note.title/content are required"
      };
    }

    const { confirmRefactorSave } = await import("./refactor");
    return confirmRefactorSave(config, payload.requestId, payload.sourcePath, payload.note as any);
  })
  .listen(3000);

console.log(`API listening on http://${app.server?.hostname}:${app.server?.port}`);
console.log("Embedding provider:", config.embeddingProvider);
if (config.embeddingProvider === "gemini-geap") {
  console.log("GCP project:", config.gcpProjectId ?? "(missing)");
  console.log("GCP location:", config.gcpLocation ?? "(default)");
}

const watcher = startIngestionWatcher(config);
console.log("Vault watcher active on:", config.vaultPath);

process.on("SIGINT", async () => {
  await watcher.stop();
  process.exit(0);
});
