import { describe, expect, test } from "bun:test";

import {
  askModelResponseSchema,
  synthesisModelResponseSchema,
} from "@llm-wiki/types";

import {
  createInvalidModelResponse,
  INVALID_MODEL_RESPONSE_CODE,
  INVALID_MODEL_RESPONSE_ERROR,
  parseStructuredModelResponse,
} from "./model-response";

describe("structured model responses", () => {
  test("validates a complete ask response and applies optional collection defaults", () => {
    const result = parseStructuredModelResponse(
      JSON.stringify({
        answer: "A concise answer",
        suggested_note: {
          title: "A note",
          content: "Markdown content",
        },
      }),
      askModelResponseSchema,
    );

    expect(result).toEqual({
      success: true,
      data: {
        answer: "A concise answer",
        suggested_note: {
          title: "A note",
          content: "Markdown content",
          links: [],
          tags: [],
        },
        citations: [],
      },
    });
  });

  test("rejects malformed JSON without attempting substring extraction", () => {
    const result = parseStructuredModelResponse(
      "Here is the response: {\"note\": {\"title\": \"A\", \"content\": \"B\"}}",
      synthesisModelResponseSchema,
    );

    expect(result).toEqual({ success: false, reason: "invalid_json" });
  });

  test("rejects JSON that does not meet the model contract", () => {
    const result = parseStructuredModelResponse(
      JSON.stringify({
        answer: "A concise answer",
        suggested_note: {
          title: "A note",
          content: "Markdown content",
        },
        citations: ["not-a-context-number"],
      }),
      askModelResponseSchema,
    );

    expect(result).toEqual({ success: false, reason: "invalid_schema" });
  });

  test("returns a stable safe error without model response content", () => {
    const result = createInvalidModelResponse();

    expect(result).toEqual({
      error: INVALID_MODEL_RESPONSE_ERROR,
      code: INVALID_MODEL_RESPONSE_CODE,
    });
    expect(JSON.stringify(result)).not.toContain("rawResponse");
  });
});
