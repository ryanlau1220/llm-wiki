import { Elysia } from "elysia";

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
