import { Elysia } from "elysia";

import { cors } from "@elysiajs/cors";
import { loadConfig } from "./config";
import { startIngestionWatcher } from "./watcher";
import { authPlugin, seedDefaultUser } from "./auth";
import { RPCHandler } from "@orpc/server/fetch";
import { router } from "./router";

const config = loadConfig();
await seedDefaultUser(config);

const rpcHandler = new RPCHandler(router);

const app = new Elysia()
  .use(cors())
  .get("/", () => ({
    message: "LLM Wiki API is running (oRPC enabled)"
  }))
  .onError(({ code, error }: any) => {
    console.error(`[API Error] ${code}:`, error);
    return {
      status: 500,
      code,
      message: error?.message || "Internal Server Error"
    };
  })
  .use(authPlugin(config))
  .all("/rpc/*", async ({ request, user, jwt, cookie }: any) => {
    const { response } = await rpcHandler.handle(request, {
      prefix: "/rpc",
      context: { user, jwt, cookie }
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
console.log("Vault watcher active on:", config.vaultPath);

process.on("SIGINT", async () => {
  await watcher.stop();
  process.exit(0);
});
