import { afterEach, describe, expect, test } from "bun:test";

import {
  configuredOllamaModels,
  inspectOllamaModels,
  isOllamaModelInstalled,
  pullOllamaModel,
} from "./models";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Ollama model readiness", () => {
  test("uses configured models and removes duplicates", () => {
    expect(
      configuredOllamaModels({
        OLLAMA_LLM_MODEL: "llama3",
        OLLAMA_EVALUATOR_MODEL: "qwen3:4b",
        OLLAMA_EMBEDDING_MODEL: "llama3",
      }),
    ).toEqual(["llama3", "qwen3:4b"]);
  });

  test("treats the implicit latest tag as the configured model", () => {
    expect(isOllamaModelInstalled("llama3", ["llama3:latest"])).toBe(true);
    expect(isOllamaModelInstalled("llama3:latest", ["llama3"])).toBe(true);
  });

  test("reports configured models absent from the local model list", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          models: [{ name: "llama3:latest" }],
        }),
      )) as unknown as typeof fetch;

    await expect(
      inspectOllamaModels("http://ollama.test/", ["llama3", "nomic-embed-text"]),
    ).resolves.toEqual({
      installedModels: ["llama3:latest"],
      missingModels: ["nomic-embed-text"],
    });
  });

  test("streams pull progress from Ollama's model download endpoint", async () => {
    let request: RequestInit | undefined;
    const progress: Array<{ completed?: number; status?: string; total?: number }> = [];
    globalThis.fetch = (async (_input, init) => {
      request = init;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                `${JSON.stringify({ status: "pulling", completed: 25, total: 100 })}\n${JSON.stringify({ status: "success" })}\n`,
              ),
            );
            controller.close();
          },
        }),
      );
    }) as typeof fetch;

    await pullOllamaModel("http://ollama.test", "llama3", {
      onProgress: (event) => progress.push(event),
    });

    expect(request).toMatchObject({
      method: "POST",
      body: JSON.stringify({ model: "llama3", stream: true }),
    });
    expect(progress).toEqual([
      { status: "pulling", completed: 25, total: 100 },
      { status: "success" },
    ]);
  });
});
