import { implement } from "@orpc/server";
import { appContract } from "@llm-wiki/types";
import { askPreview, confirmAskSave } from "./ask";
import { reindexFile } from "./reindex";
import { loadConfig } from "./config";
import { promises as fs } from "node:fs";
import path from "node:path";
import systemOs from "node:os";
import { getWatcher, setWatcher } from "./watcher-manager";
import {
  approveResearchCapture,
  createExtensionPairingCodeForDashboard,
  discardResearchCapture,
  listResearchCaptureActivities,
  listResearchCaptureInbox,
  mergeResearchCapture,
  retryResearchCaptureIndex,
} from "./research-captures";
import { getAiTraceDetail, listAiTracePage } from "./ai-traces";
import { compareAiEvaluationRuns, createAiEvaluationDataset, getAiEvaluationCapabilities, getAiEvaluationRun, listAiEvaluationDatasets, listAiEvaluationRuns, runAiEvaluation } from "./ai-evaluation";
import { listOrganizationSuggestions } from "./organization-suggestions";
import {
  createResearchAutomation,
  createResearchSource,
  deleteResearchAutomation,
  deleteResearchSource,
  importResearchSources,
  installResearchRadarStarterPack,
  listResearchRadarStarterSources,
  listResearchAutomationRuns,
  listResearchAutomations,
  listResearchSources,
  runResearchAutomation,
  updateResearchAutomation,
  updateResearchSource,
} from "./research-radar";

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
    return askPreview(config, input.query, input.topK, input.mode);
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
  listBackups: os.listBackups.use(authMiddleware).handler(async ({ input }: any) => {
    const { listBackups } = await import("./refactor");
    return listBackups(config, input.path);
  }),
  getBackupContent: os.getBackupContent.use(authMiddleware).handler(async ({ input }: any) => {
    const { getBackupContent } = await import("./refactor");
    return getBackupContent(config, input.path, input.timestamp);
  }),
  restoreBackup: os.restoreBackup.use(authMiddleware).handler(async ({ input }: any) => {
    const { restoreBackup } = await import("./refactor");
    return restoreBackup(config, input.path, input.timestamp);
  }),
  synthesisPreview: os.synthesisPreview.use(authMiddleware).handler(async ({ input }: any) => {
    const { synthesisPreview } = await import("./synthesis");
    return synthesisPreview(config, input.topic, input.topK, input.noteIds);
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
  bootstrapPreview: os.bootstrapPreview.use(authMiddleware).handler(async ({ input }: any) => {
    const { generateBootstrapPreview } = await import("./note-creator");
    return generateBootstrapPreview(config, input.title);
  }),
  confirmBootstrapSave: os.confirmBootstrapSave.use(authMiddleware).handler(async ({ input }: any) => {
    const { confirmAskSave } = await import("./ask-confirm");
    return confirmAskSave(
      config,
      input.requestId,
      input.note,
      { type: "ai_generated", source: "synthesis" }
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
  reindexAll: os.reindexAll.use(authMiddleware).handler(async () => {
    const { syncVault } = await import("./watcher");
    const { createDbClient } = await import("@llm-wiki/db");
    const { createEmbeddingProvider, createLLMProvider } = await import("@llm-wiki/ai");
    
    const { db } = createDbClient(config.databaseUrl!);
    const embeddingProvider = createEmbeddingProvider({
      provider: config.embeddingProvider,
      geminiGeap: {
        projectId: config.gcpProjectId,
        location: config.gcpLocation,
        model: config.gcpEmbeddingModel
      }
    });
    const llmProvider = createLLMProvider({
      provider: config.embeddingProvider as any,
      geminiGeap: {
        projectId: config.gcpProjectId,
        location: config.gcpLocation,
        model: config.gcpLlmModel
      }
    });

    const logger = (await import("@llm-wiki/core")).createLogger("sync");
    logger.info("Manual reindexing of entire vault triggered");
    
    await syncVault(config, db, embeddingProvider, llmProvider);
    
    const { sseEmitter } = await import("./events");
    sseEmitter.emit("change", { type: "note_changed", path: "*" });
    
    return { success: true };
  }),
  getLinkHealth: os.getLinkHealth.handler(async () => {
    const { createDbClient } = await import("@llm-wiki/db");
    const { getGlobalLinkHealth } = await import("@llm-wiki/core");
    const { db } = createDbClient(config.databaseUrl!);
    return getGlobalLinkHealth(db);
  }),
  listOrganizationSuggestions: os.listOrganizationSuggestions
    .use(authMiddleware)
    .handler(async ({ input }) => listOrganizationSuggestions(config, input)),
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
      isAiGenerated: documents.is_ai_generated,
      aiStatus: documents.ai_status,
      healthScore: documents.health_score,
      qualityScore: documents.quality_score,
      qualityMetrics: documents.quality_metrics
    }).from(documents);
    return results;
  }),
  getGraph: os.getGraph.handler(async () => {
    const { createDbClient, documents, links } = await import("@llm-wiki/db");
    const { isNotNull } = await import("drizzle-orm");
    const { db } = createDbClient(config.databaseUrl!);

    const docResults = await db.select({ 
      id: documents.id, 
      title: documents.title,
      path: documents.path, 
      type: documents.type,
      is_ai_generated: documents.is_ai_generated,
      qualityScore: documents.quality_score,
    }).from(documents);

    const linkResults = await db.select({
      source: links.source_document_id,
      target: links.target_document_id,
      label: links.target_label,
    }).from(links).where(isNotNull(links.target_document_id));

    const validDocIds = new Set(docResults.map(d => d.id));
    const edges = linkResults.filter(l => 
      l.source && 
      l.target && 
      validDocIds.has(l.source) && 
      validDocIds.has(l.target)
    ) as Array<{ source: string; target: string; label: string }>;

    return {
      nodes: docResults,
      edges,
    };
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
  }),
  getSettings: os.getSettings.handler(async () => {
    return { vaultPath: config.vaultPath };
  }),
  updateSettings: os.updateSettings.use(authMiddleware).handler(async ({ input }: any) => {
    const { vaultPath } = input;
    let targetPath = vaultPath;

    if (process.platform === "linux") {
      let isWSL = false;
      if (process.env.WSL_DISTRO_NAME) {
        isWSL = true;
      } else {
        try {
          const version = await fs.readFile("/proc/version", "utf8");
          if (version.toLowerCase().includes("microsoft") || version.toLowerCase().includes("wsl")) {
            isWSL = true;
          }
        } catch {}
      }

      if (isWSL) {
        let normalized = targetPath.replace(/\\/g, "/");
        const driveMatch = normalized.match(/^([a-zA-Z]):/);
        if (driveMatch) {
          const driveLetter = driveMatch[1].toLowerCase();
          normalized = `/mnt/${driveLetter}${normalized.substring(2)}`;
        }
        targetPath = normalized;
        console.log(`[Settings] Automatically translated Windows path to WSL mount: ${targetPath}`);
      }
    }

    const resolvedPath = path.isAbsolute(targetPath) 
      ? targetPath 
      : path.resolve(targetPath);

    try {
      await fs.access(resolvedPath);
    } catch {
      try {
        await fs.mkdir(resolvedPath, { recursive: true });
      } catch (err: any) {
        return { success: false, error: `Directory does not exist and could not be created: ${err.message}` };
      }
    }

    const { createDbClient, settings } = await import("@llm-wiki/db");
    const { db } = createDbClient(config.databaseUrl!);

    try {
      await db
        .insert(settings)
        .values({
          key: "vault_path",
          value: resolvedPath,
          updated_at: new Date(),
        })
        .onConflictDoUpdate({
          target: settings.key,
          set: {
            value: resolvedPath,
            updated_at: new Date(),
          },
        });
    } catch (err: any) {
      return { success: false, error: `Failed to save settings: ${err.message}` };
    }

    config.vaultPath = resolvedPath;
    console.log(`[Config] Dynamically updated VAULT_PATH to: ${config.vaultPath}`);

    const activeWatcher = getWatcher();
    if (activeWatcher) {
      console.log("[Watcher] Stopping active vault watcher...");
      await activeWatcher.stop();
    }

    const { syncVault, startIngestionWatcher } = await import("./watcher");
    const { createEmbeddingProvider, createLLMProvider } = await import("@llm-wiki/ai");

    try {
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

      console.log("[Sync] Triggering synchronization for the new vault path...");
      await syncVault(config, db, embeddingProvider, llmProvider);

      console.log("[Watcher] Restarting vault watcher on the new path...");
      const newWatcher = await startIngestionWatcher(config);
      setWatcher(newWatcher);

      const { sseEmitter } = await import("./events");
      sseEmitter.emit("change", { type: "note_changed", path: "*" });

      return { success: true };
    } catch (err: any) {
      console.error("[Settings] Error restarting watcher / syncing:", err);
      return { success: false, error: `Settings updated, but sync or watcher failed: ${err.message}` };
    }
  }),
  browseDirectories: os.browseDirectories.handler(async ({ input }: any) => {
    const { createLogger } = await import("@llm-wiki/core");
    const logger = createLogger("settings");

    const targetPath = input?.path || config.vaultPath || systemOs.homedir() || "/";

    // Build quick access shortcuts
    const shortcuts: Array<{ name: string; path: string }> = [];

    // 1. Home directory
    const homeDir = systemOs.homedir();
    if (homeDir) {
      shortcuts.push({ name: "Home (~)", path: homeDir.replace(/\\/g, "/") });
    }

    // 2. Root directory
    shortcuts.push({ name: "Root (/) ", path: "/" });

    // 3. WSL / Linux drives (check /mnt)
    if (process.platform === "linux") {
      try {
        const mntEntries = await fs.readdir("/mnt", { withFileTypes: true });
        for (const entry of mntEntries) {
          if (entry.isDirectory() && !entry.name.startsWith(".")) {
            const name = entry.name;
            if (name === "wsl" || name === "wslg") {
              continue;
            }
            if (name.length === 1 || name === "c" || name === "d" || name === "e" || name === "f") {
              shortcuts.push({
                name: `Windows (${name.toUpperCase()}:)`,
                path: `/mnt/${name}`
              });
            } else {
              shortcuts.push({
                name: `Mount (${name})`,
                path: `/mnt/${name}`
              });
            }
          }
        }
      } catch {}
    } else if (process.platform === "win32") {
      // 4. Windows drives
      for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
        const drivePath = `${letter}:\\`;
        try {
          await fs.access(drivePath);
          shortcuts.push({
            name: `Drive (${letter}:)`,
            path: drivePath.replace(/\\/g, "/")
          });
        } catch {}
      }
    }

    // Resolve targetPath to absolute path
    let absolutePath = path.resolve(targetPath);

    // If path is a file, get its directory
    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isDirectory()) {
        absolutePath = path.dirname(absolutePath);
      }
    } catch {
      // If path doesn't exist, fall back to home dir or process cwd
      absolutePath = path.resolve(systemOs.homedir() || process.cwd());
    }

    try {
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });

      // Filter only directories and non-hidden ones
      const directories = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));

      const parentPath = absolutePath === path.parse(absolutePath).root 
        ? null 
        : path.dirname(absolutePath);

      return {
        currentPath: absolutePath.replace(/\\/g, "/"),
        parentPath: parentPath ? parentPath.replace(/\\/g, "/") : null,
        directories,
        shortcuts
      };
    } catch (err: any) {
      logger.error(`Failed to browse path ${absolutePath}`, err);
      const home = path.resolve(systemOs.homedir() || "/");
      try {
        const entries = await fs.readdir(home, { withFileTypes: true });
        const directories = entries
          .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
          .map((entry) => entry.name)
          .sort((a, b) => a.localeCompare(b));
        return {
          currentPath: home.replace(/\\/g, "/"),
          parentPath: null,
          directories,
          shortcuts,
          error: err.message
        };
      } catch {
        return {
          currentPath: "/",
          parentPath: null,
          directories: [],
          shortcuts,
          error: err.message
        };
      }
    }
  }),
  createExtensionPairingCode: os.createExtensionPairingCode.use(authMiddleware).handler(async () => {
    return createExtensionPairingCodeForDashboard(config);
  }),
  listResearchCaptures: os.listResearchCaptures.use(authMiddleware).handler(async ({ input }: any) => {
    return listResearchCaptureInbox(config, input?.status);
  }),
  approveResearchCapture: os.approveResearchCapture.use(authMiddleware).handler(async ({ input }: any) => {
    return approveResearchCapture(config, input);
  }),
  mergeResearchCapture: os.mergeResearchCapture.use(authMiddleware).handler(async ({ input }: any) => {
    return mergeResearchCapture(config, input);
  }),
  discardResearchCapture: os.discardResearchCapture.use(authMiddleware).handler(async ({ input }: any) => {
    return discardResearchCapture(config, input.id);
  }),
  retryResearchCaptureIndex: os.retryResearchCaptureIndex.use(authMiddleware).handler(async ({ input }: any) => {
    return retryResearchCaptureIndex(config, input);
  }),
  listResearchCaptureActivities: os.listResearchCaptureActivities.use(authMiddleware).handler(async ({ input }: any) => {
    return listResearchCaptureActivities(config, input.id);
  }),
  listResearchSources: os.listResearchSources.use(authMiddleware).handler(async () => listResearchSources(config)),
  createResearchSource: os.createResearchSource.use(authMiddleware).handler(async ({ input }) => createResearchSource(config, input)),
  importResearchSources: os.importResearchSources.use(authMiddleware).handler(async ({ input }) => importResearchSources(config, input.opml)),
  updateResearchSource: os.updateResearchSource.use(authMiddleware).handler(async ({ input }) => updateResearchSource(config, input)),
  deleteResearchSource: os.deleteResearchSource.use(authMiddleware).handler(async ({ input }) => deleteResearchSource(config, input.id)),
  listResearchRadarStarterSources: os.listResearchRadarStarterSources.use(authMiddleware).handler(async () => listResearchRadarStarterSources()),
  installResearchRadarStarterPack: os.installResearchRadarStarterPack.use(authMiddleware).handler(async () => installResearchRadarStarterPack(config)),
  listResearchAutomations: os.listResearchAutomations.use(authMiddleware).handler(async () => listResearchAutomations(config)),
  createResearchAutomation: os.createResearchAutomation.use(authMiddleware).handler(async ({ input }) => createResearchAutomation(config, input)),
  updateResearchAutomation: os.updateResearchAutomation.use(authMiddleware).handler(async ({ input }) => updateResearchAutomation(config, input)),
  deleteResearchAutomation: os.deleteResearchAutomation.use(authMiddleware).handler(async ({ input }) => deleteResearchAutomation(config, input.id)),
  runResearchAutomation: os.runResearchAutomation.use(authMiddleware).handler(async ({ input }) => runResearchAutomation(config, input.id)),
  listResearchAutomationRuns: os.listResearchAutomationRuns.use(authMiddleware).handler(async ({ input }) => listResearchAutomationRuns(config, input.automationId, input.limit)),
  listAiTraces: os.listAiTraces.use(authMiddleware).handler(async ({ input }) => {
    return listAiTracePage(config, input);
  }),
  getAiTrace: os.getAiTrace.use(authMiddleware).handler(async ({ input }) => {
    return getAiTraceDetail(config, input.traceId);
  }),
  createAiEvaluationDataset: os.createAiEvaluationDataset.use(authMiddleware).handler(async ({ input }) => {
    return createAiEvaluationDataset(config, input);
  }),
  listAiEvaluationDatasets: os.listAiEvaluationDatasets.use(authMiddleware).handler(async () => {
    return listAiEvaluationDatasets(config);
  }),
  runAiEvaluation: os.runAiEvaluation.use(authMiddleware).handler(async ({ input }) => {
    return runAiEvaluation(config, input);
  }),
  getAiEvaluationCapabilities: os.getAiEvaluationCapabilities.use(authMiddleware).handler(async () => {
    return getAiEvaluationCapabilities(config);
  }),
  listAiEvaluationRuns: os.listAiEvaluationRuns.use(authMiddleware).handler(async ({ input }) => {
    return listAiEvaluationRuns(config, input?.datasetId);
  }),
  getAiEvaluationRun: os.getAiEvaluationRun.use(authMiddleware).handler(async ({ input }) => {
    return getAiEvaluationRun(config, input.runId);
  }),
  compareAiEvaluationRuns: os.compareAiEvaluationRuns.use(authMiddleware).handler(async ({ input }) => {
    return compareAiEvaluationRuns(config, input);
  }),
});
