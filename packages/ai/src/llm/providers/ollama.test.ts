import { afterEach, describe, expect, test } from "bun:test";

import { OllamaLLMProvider } from "./ollama";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("OllamaLLMProvider", () => {
  test("forwards system and structured-output requests while retaining local usage counters", async () => {
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        response: '{"score":0.8,"labels":["supported"]}',
        prompt_eval_count: 13,
        eval_count: 7,
      }));
    }) as typeof fetch;

    const response = await new OllamaLLMProvider({ baseUrl: "http://ollama.test", model: "llama3" }).generate({
      prompt: "Evaluate this response",
      systemInstruction: "Return only JSON.",
      responseMimeType: "application/json",
      temperature: 0,
      maxOutputTokens: 256,
    });

    expect(requestBody).toMatchObject({
      model: "llama3",
      prompt: "Evaluate this response",
      system: "Return only JSON.",
      format: "json",
      stream: false,
      options: { temperature: 0, num_predict: 256 },
    });
    expect(response.usage).toEqual({ promptTokens: 13, candidatesTokens: 7, totalTokens: 20 });
  });
});
