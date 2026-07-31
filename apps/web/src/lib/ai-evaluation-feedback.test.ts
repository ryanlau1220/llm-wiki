import { expect, test } from "bun:test";

import { acceptedRagRegressionInput, aiTraceFeedbackInput } from "./ai-evaluation-feedback";

test("a saved RAG response contributes an approved local regression probe", () => {
  expect(acceptedRagRegressionInput({
    mode: "rag",
    query: "How does retrieval work?",
    data: { traceId: "trace-123" },
  })).toEqual({ traceId: "trace-123", redactedInput: "How does retrieval work?" });
});

test("non-RAG results and missing traces never become regression probes", () => {
  expect(acceptedRagRegressionInput({ mode: "general", query: "hello", data: { traceId: "trace-123" } })).toBeNull();
  expect(acceptedRagRegressionInput({ mode: "rag", query: "hello", data: {} })).toBeNull();
});

test("feedback maps only a visible RAG request to a compact trace signal", () => {
  expect(aiTraceFeedbackInput({
    mode: "rag",
    query: "How does retrieval work?",
    data: { traceId: "trace-123" },
  }, "missing_source")).toEqual({
    traceId: "trace-123",
    signal: "missing_source",
    redactedInput: "How does retrieval work?",
  });
  expect(aiTraceFeedbackInput({ mode: "general", query: "hello", data: { traceId: "trace-123" } }, "incorrect")).toEqual({
    traceId: "trace-123",
    signal: "incorrect",
    redactedInput: "hello",
  });
  expect(aiTraceFeedbackInput({ mode: "rag", query: "hello", data: {} }, "incorrect")).toBeNull();
});
