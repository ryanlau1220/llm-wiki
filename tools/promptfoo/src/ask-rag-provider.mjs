const targetUrl = (process.env.LLM_WIKI_EVALUATION_TARGET_URL ?? "").replace(/\/$/, "");

export default class LlmWikiAskRagProvider {
  id() {
    return "llm-wiki:ask-rag";
  }

  async callApi(prompt) {
    if (!targetUrl) throw new Error("LLM_WIKI_EVALUATION_TARGET_URL is required");
    const response = await fetch(`${targetUrl}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: prompt, topK: 8 }),
    });
    const payload = await response.json();
    if (!response.ok || typeof payload?.answer !== "string") {
      throw new Error(`Ask/RAG target failed: ${payload?.error ?? response.status}`);
    }
    return {
      output: payload.answer,
      tokenUsage: {},
      metadata: {
        citation_count: Array.isArray(payload.citations) ? payload.citations.length : 0,
        trace_id: typeof payload.traceId === "string" ? payload.traceId : null,
      },
    };
  }
}
