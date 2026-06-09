import { implement } from "@orpc/server";
import { appContract } from "@llm-wiki/types";
import { askPreview, confirmAskSave } from "./ask";
import { reindexFile } from "./reindex";
import { loadConfig } from "./config";
import { promises as fs } from "node:fs";

const config = loadConfig();
const os = implement(appContract);

const authMiddleware = os.middleware(async ({ context, next }: any) => {
  const { user } = context;
  if (!user) {
    throw new Error("Unauthorized");
  }
  return next({
    context: { user }
  });
});

export const router = os.router({
  me: os.me.handler(async ({ context }: any) => {
    console.log("[API] Me handler called. User context:", context.user);
    return context.user || null;
  }),
  login: os.login.handler(async ({ input, context }: any) => {
    const { verifyUser } = await import("./auth");
    const user = await verifyUser(config, input.email, input.password);
    console.log("[API] Login attempt for:", input.email, "Result:", !!user);
    if (!user) return { success: false };

    const { jwt, cookie } = context as any;
    const token = await jwt.sign({
      id: user.id,
      email: user.email,
      role: user.role
    });

    console.log("[API] Setting session cookie...");
    cookie.session.set({
      value: token,
      httpOnly: true,
      maxAge: 7 * 86400,
      path: "/",
      sameSite: "lax",
      secure: false
    });

    return { success: true, token, user: { email: user.email, role: user.role } };
  }),
  logout: os.logout.handler(async ({ context }: any) => {
    console.log("[API] Logout handler called");
    const { cookie } = context as any;
    cookie.session.remove();
    return { success: true };
  }),
  askPreview: os.askPreview.use(authMiddleware).handler(async ({ input }: any) => {
    return askPreview(config, input.query, input.topK);
  }),
  confirmAskSave: os.confirmAskSave.use(authMiddleware).handler(async ({ input }: any) => {
    return confirmAskSave(config, input.requestId, input.note);
  }),
  refactorPreview: os.refactorPreview.use(authMiddleware).handler(async ({ input }: any) => {
    const { refactorNotePreview } = await import("./refactor");
    return refactorNotePreview(config, input.path);
  }),
  confirmRefactorSave: os.confirmRefactorSave.use(authMiddleware).handler(async ({ input }: any) => {
    const { confirmRefactorSave } = await import("./refactor");
    return confirmRefactorSave(config, input.requestId, input.sourcePath, input.note as any);
  }),
  synthesisPreview: os.synthesisPreview.use(authMiddleware).handler(async ({ input }: any) => {
    const { synthesisPreview } = await import("./synthesis");
    return synthesisPreview(config, input.topic, input.topK);
  }),
  confirmSynthesisSave: os.confirmSynthesisSave.use(authMiddleware).handler(async ({ input }: any) => {
    const { confirmAskSave } = await import("./ask-confirm");
    return confirmAskSave(
      config,
      input.requestId,
      input.note,
      { type: "ai_synthesized", source: "synthesis" }
    );
  }),
  getWeakNotes: os.getWeakNotes.use(authMiddleware).handler(async ({ input }: any) => {
    const { createDbClient } = await import("@llm-wiki/db");
    const { getWeakNotes } = await import("@llm-wiki/core");
    const { db } = createDbClient(config.databaseUrl!);
    return getWeakNotes(db, input ?? {});
  }),
  getImprovementSuggestions: os.getImprovementSuggestions.use(authMiddleware).handler(async ({ input }: any) => {
    const { createDbClient, documents } = await import("@llm-wiki/db");
    const { suggestImprovements } = await import("@llm-wiki/core");
    const { createLLMProvider } = await import("@llm-wiki/ai");
    const { eq } = await import("drizzle-orm");

    const { db } = createDbClient(config.databaseUrl!);
    const doc = await db.select().from(documents).where(eq(documents.id, input.documentId)).limit(1);
    
    if (!doc.length) throw new Error("Document not found");

    const llmProvider = createLLMProvider({
      provider: config.embeddingProvider,
      geminiGeap: {
        projectId: config.gcpProjectId,
        location: config.gcpLocation,
        model: config.gcpLlmModel
      }
    });

    return suggestImprovements(llmProvider, doc[0].content);
  }),
  reindex: os.reindex.use(authMiddleware).handler(async ({ input }: any) => {
    return reindexFile(config, input.path);
  }),
  getLinkHealth: os.getLinkHealth.handler(async () => {
    const { createDbClient } = await import("@llm-wiki/db");
    const { getGlobalLinkHealth } = await import("@llm-wiki/core");
    const { db } = createDbClient(config.databaseUrl!);
    return getGlobalLinkHealth(db);
  }),
  health: os.health.handler(async () => {
    console.log("[Health] Checking system status...");
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
    } catch (_e) {
      health.status = "error";
      health.services.database = "error";
    }
    try {
      await fs.access(config.vaultPath);
      health.services.vault = "ok";
    } catch (e: any) {
      console.error(`[Health] Vault access failed for path: ${config.vaultPath}`, e.message);
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
  }),
  getNote: os.getNote.use(authMiddleware).handler(async ({ input }: any) => {
    const { createDbClient, documents } = await import("@llm-wiki/db");
    const { eq } = await import("drizzle-orm");
    const { db } = createDbClient(config.databaseUrl!);
    const results = await db.select().from(documents).where(eq(documents.id, input.id)).limit(1);
    if (!results.length) throw new Error("Note not found");
    const doc = results[0];
    return {
      id: doc.id,
      path: doc.path,
      title: doc.title,
      content: doc.content,
      type: doc.type,
      is_ai_generated: doc.is_ai_generated,
      qualityScore: doc.quality_score,
      qualityMetrics: doc.quality_metrics,
      created_at: doc.created_at.toISOString(),
      updated_at: doc.updated_at.toISOString()
    };
  })
});
