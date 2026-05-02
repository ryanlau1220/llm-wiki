import { Elysia } from "elysia";

import { askPreview, confirmAskSave } from "./ask";
import { loadConfig } from "./config";
import { reindexFile } from "./reindex";
import { startIngestionWatcher } from "./watcher";

const config = loadConfig();

import { promises as fs } from "node:fs";
import { createDbClient } from "@llm-wiki/db";

import { RPCHandler } from "@orpc/server/fetch";
import { router } from "./router";

import { cors } from "@elysiajs/cors";

const rpcHandler = new RPCHandler(router);

const app = new Elysia()
  .use(cors())
  .get("/", () => ({
    message: "LLM Wiki API is running (oRPC enabled)"
  }))
  .onError(({ code, error }) => {
    console.error(`[API Error] ${code}:`, error);
    return {
      status: 500,
      code,
      message: error.message
    };
  })
  .all("/rpc/*", async ({ request, path }) => {
    const { response } = await rpcHandler.handle(request, {
      prefix: "/rpc"
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
}

const watcher = startIngestionWatcher(config);
console.log("Vault watcher active on:", config.vaultPath);

process.on("SIGINT", async () => {
  await watcher.stop();
  process.exit(0);
});
