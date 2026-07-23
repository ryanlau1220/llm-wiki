import { Elysia } from "elysia";

import { cors } from "@elysiajs/cors";
import { loadConfig } from "./config";
import { startIngestionWatcher } from "./watcher";
import { authPlugin, seedDefaultUser } from "./auth";
import { RPCHandler } from "@orpc/server/fetch";
import { router } from "./router";
import { sseEmitter } from "./events";
import { createLogger } from "@llm-wiki/core";
import { createDbClient, settings } from "@llm-wiki/db";
import { eq } from "drizzle-orm";
import path from "node:path";
import { setWatcher, getWatcher } from "./watcher-manager";
import { researchCaptureExtensionRoutes } from "./extension-routes";

const config = loadConfig();

// Load vault path override from database if configured
if (config.databaseUrl) {
  try {
    const { db } = createDbClient(config.databaseUrl);
    const dbSettings = await db
      .select()
      .from(settings)
      .where(eq(settings.key, "vault_path"))
      .limit(1);

    if (dbSettings.length > 0 && dbSettings[0].value) {
      const dbPath = dbSettings[0].value;
      console.log(`[Config] Overriding VAULT_PATH from database: ${dbPath}`);
      
      const resolved = path.isAbsolute(dbPath) 
        ? dbPath 
        : path.resolve(dbPath);
      
      config.vaultPath = resolved;
      console.log(`[Config] New VAULT_PATH resolved to: ${config.vaultPath}`);
    }
  } catch (error) {
    console.error("[Config] Failed to load vault path setting from database:", error);
  }
}

await seedDefaultUser(config);

const rpcHandler = new RPCHandler(router);

const app = new Elysia()
  .use(cors({
    origin: "http://localhost:3000",
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  }))
  .onRequest(({ request }) => {
    const logger = createLogger("http");
    const url = new URL(request.url);
    logger.info(`Incoming request: ${request.method} ${url.pathname}${url.search}`);
  })
  .onAfterResponse(({ request, set }) => {
    const logger = createLogger("http");
    const url = new URL(request.url);
    const status = set.status ?? 200;
    logger.info(`Response completed: ${request.method} ${url.pathname} - Status ${status}`);
  })
  .get("/", () => ({
    message: "LLM Wiki API is running (oRPC enabled)"
  }))
  .get("/openapi.json", async () => {
    const { generateOpenApiSpec } = await import("./openapi");
    return generateOpenApiSpec();
  })
  .get("/docs", async () => {
    const { scalarHtml } = await import("./openapi");
    return new Response(scalarHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8"
      }
    });
  })
  .get("/events", () => {
    let listener: ((data: any) => void) | null = null;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        listener = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };
        sseEmitter.on("change", listener);
      },
      cancel() {
        if (listener) {
          sseEmitter.off("change", listener);
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  })
  .onError(({ code, error }: any) => {
    console.error(`[API Error] ${code}:`, error);
    return {
      status: 500,
      code,
      message: error?.message || "Internal Server Error"
    };
  })
  .use(researchCaptureExtensionRoutes(config))
  .use(authPlugin(config))
  .all("/rpc/*", async ({ request, user, jwt, cookie }: any) => {
    // Explicitly derive user if not already present
    let finalUser = user;
    if (!finalUser && cookie.session?.value) {
      console.log("[API] Manually deriving user from session cookie...");
      try {
        const payload = await jwt.verify(cookie.session.value);
        if (payload) {
          finalUser = {
            id: payload.id as string,
            email: payload.email as string,
            role: payload.role as string
          };
          console.log("[API] Manual derivation successful:", finalUser.email);
        } else {
          console.log("[API] Manual derivation failed: invalid JWT");
        }
      } catch (e) {
        console.error("[API] Manual derivation error:", e);
      }
    }

    const { response } = await rpcHandler.handle(request, {
      prefix: "/rpc",
      context: { user: finalUser, jwt, cookie }
    });
    return response;
  }, {
    parse: "none"
  })
  .listen(3001);

console.log(`API listening on http://${app.server?.hostname}:${app.server?.port}`);
console.log("Embedding provider:", config.embeddingProvider);
if (config.embeddingProvider === "gemini-geap") {
  console.log("GCP project:", config.gcpProjectId ?? "(missing)");
  console.log("GCP location:", config.gcpLocation ?? "(default)");
  console.log("GCP LLM model:", config.gcpLlmModel ?? "(default)");
  console.log("GCP embedding model:", config.gcpEmbeddingModel ?? "(default)");
}

const watcher = await startIngestionWatcher(config);
setWatcher(watcher);
console.log("Vault watcher active on:", config.vaultPath);

process.on("SIGINT", async () => {
  const activeWatcher = getWatcher();
  if (activeWatcher) {
    await activeWatcher.stop();
  }
  process.exit(0);
});
