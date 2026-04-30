import { Elysia } from "elysia";

import { loadConfig } from "./config";
import { startIngestionWatcher } from "./watcher";

const config = loadConfig();

const app = new Elysia()
  .get("/health", () => ({
    status: "ok",
    service: "llm-wiki-api"
  }))
  .get("/", () => ({
    message: "LLM Wiki API is running"
  }))
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
