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
        OLLAMA_EMBEDDING_MODEL: "llama3",
      }),
    ).toEqual(["llama3"]);
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

  test("downloads a model through Ollama's non-streaming pull endpoint", async () => {
    let request: RequestInit | undefined;
    globalThis.fetch = (async (_input, init) => {
      request = init;
      return new Response(JSON.stringify({ status: "success" }));
    }) as typeof fetch;

    await pullOllamaModel("http://ollama.test", "llama3");

    expect(request).toMatchObject({
      method: "POST",
      body: JSON.stringify({ model: "llama3", stream: false }),
    });
  });
});
