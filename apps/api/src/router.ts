import { implement } from "@orpc/server";
import { appContract } from "@llm-wiki/types";
import { askPreview, confirmAskSave } from "./ask";
import { reindexFile } from "./reindex";
import { loadConfig } from "./config";
import { promises as fs } from "node:fs";
import { createDbClient } from "@llm-wiki/db";

const config = loadConfig();
const os = implement(appContract);

export const router = os.router({
  askPreview: os.askPreview.handler(async ({ input }) => {
    return askPreview(config, input.query, input.topK);
  }),
  confirmAskSave: os.confirmAskSave.handler(async ({ input }) => {
    return confirmAskSave(config, input.requestId, input.note);
  }),
  refactorPreview: os.refactorPreview.handler(async ({ input }) => {
    const { refactorNotePreview } = await import("./refactor");
    return refactorNotePreview(config, input.path);
  }),
  confirmRefactorSave: os.confirmRefactorSave.handler(async ({ input }) => {
    const { confirmRefactorSave } = await import("./refactor");
    return confirmRefactorSave(config, input.requestId, input.sourcePath, input.note as any);
  }),
  reindex: os.reindex.handler(async ({ input }) => {
    return reindexFile(config, input.path);
  }),
  getLinkHealth: os.getLinkHealth.handler(async () => {
    const { createDbClient } = await import("@llm-wiki/db");
    const { getGlobalLinkHealth } = await import("@llm-wiki/core");
    const { db } = createDbClient(config.databaseUrl!);
    return getGlobalLinkHealth(db);
  }),
  health: os.health.handler(async () => {
    const health: any = {
      status: "ok",
      timestamp: new Date().toISOString(),
      services: { api: "ok" }
    };
    try {
      const { db } = createDbClient(config.databaseUrl!);
      await db.execute("SELECT 1");
      health.services.database = "ok";
    } catch (e) {
      health.status = "error";
      health.services.database = "error";
    }
    try {
      await fs.access(config.vaultPath);
      health.services.vault = "ok";
    } catch (e) {
      health.status = "error";
      health.services.vault = "error";
    }
    return health;
  }),
  listNotes: os.listNotes.handler(async () => {
    const { createDbClient, documents } = await import("@llm-wiki/db");
    const { db } = createDbClient(config.databaseUrl!);
    const results = await db.select({ 
      id: documents.id, 
      path: documents.path, 
      title: documents.title,
      qualityScore: documents.quality_score,
      qualityMetrics: documents.quality_metrics
    }).from(documents);
    return results;
  })
});
