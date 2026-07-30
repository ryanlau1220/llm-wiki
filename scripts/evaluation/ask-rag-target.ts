import { askPreview } from "../../apps/api/src/ask";
import { loadConfig } from "../../apps/api/src/config";

const port = Number(process.env.LLM_WIKI_EVALUATION_TARGET_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("LLM_WIKI_EVALUATION_TARGET_PORT must be a valid TCP port");
}

const config = loadConfig();
const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/ask") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    try {
      const input = await request.json() as { query?: unknown; topK?: unknown };
      if (typeof input.query !== "string" || !input.query.trim()) {
        return Response.json({ error: "invalid_query" }, { status: 400 });
      }
      const topK = typeof input.topK === "number" && Number.isInteger(input.topK) && input.topK >= 1 && input.topK <= 20
        ? input.topK
        : 8;
      const result = await askPreview(config, input.query, topK, "rag");
      return Response.json({
        answer: result.answer,
        citations: result.citations ?? [],
        traceId: result.traceId ?? null,
      });
    } catch {
      return Response.json({ error: "target_execution_failed" }, { status: 500 });
    }
  },
});

console.log(`LLM_WIKI_EVALUATION_TARGET_READY:${server.port}`);

function stop() {
  server.stop(true);
  process.exit(0);
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);
