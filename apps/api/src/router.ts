import { implement } from "@orpc/server";
import { appContract } from "@llm-wiki/types";
import { askPreview, confirmAskSave } from "./ask";
import { reindexFile } from "./reindex";
import { loadConfig } from "./config";
import { promises as fs } from "node:fs";

const config = loadConfig();
const base = implement(appContract);

const os = base.middleware(async ({ context, next }) => {
  const { user } = context as any;
  return next({
    context: {
      user
    }
  });
});

const protectedProcedure = os.middleware(async ({ context, next }) => {
  if (!context.user) {
    throw new Error("Unauthorized");
  }
  return next();
});

export const router = base.router({
  me: base.me.handler(async ({ context }) => {
    return (context as any).user || null;
  }),
  login: base.login.handler(async ({ input, context }) => {
    const { verifyUser } = await import("./auth");
    const user = await verifyUser(config, input.email, input.password);
    if (!user) return { success: false };

    const { jwt, cookie } = context as any;
    const token = await jwt.sign({
      id: user.id,
      email: user.email,
      role: user.role
    });

    cookie.session.set({
      value: token,
      httpOnly: true,
      maxAge: 7 * 86400,
      path: "/"
    });

    return { success: true, user: { email: user.email, role: user.role } };
  }),
  logout: base.logout.handler(async ({ context }) => {
    const { cookie } = context as any;
    cookie.session.remove();
    return { success: true };
  }),
  askPreview: protectedProcedure.askPreview.handler(async ({ input }) => {
    return askPreview(config, input.query, input.topK);
  }),
  confirmAskSave: protectedProcedure.confirmAskSave.handler(async ({ input }) => {
    return confirmAskSave(config, input.requestId, input.note);
  }),
  refactorPreview: protectedProcedure.refactorPreview.handler(async ({ input }) => {
    const { refactorNotePreview } = await import("./refactor");
    return refactorNotePreview(config, input.path);
  }),
  confirmRefactorSave: protectedProcedure.confirmRefactorSave.handler(async ({ input }) => {
    const { confirmRefactorSave } = await import("./refactor");
    return confirmRefactorSave(config, input.requestId, input.sourcePath, input.note as any);
  }),
  reindex: protectedProcedure.reindex.handler(async ({ input }) => {
    return reindexFile(config, input.path);
  }),
  getLinkHealth: base.getLinkHealth.handler(async () => {
    const { createDbClient } = await import("@llm-wiki/db");
    const { getGlobalLinkHealth } = await import("@llm-wiki/core");
    const { db } = createDbClient(config.databaseUrl!);
    return getGlobalLinkHealth(db);
  }),
  health: base.health.handler(async () => {
    const health: any = {
      status: "ok",
      timestamp: new Date().toISOString(),
      services: { api: "ok" }
    };
    try {
      const { createDbClient } = await import("@llm-wiki/db");
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
  listNotes: base.listNotes.handler(async () => {
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
