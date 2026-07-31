import { describe, expect, test } from "bun:test";

import { buildLocalJudgePrompt, classifyLocalJudgeFailure, parseLocalJudgeResult, parsePromptfooLocalJudgeResult } from "./ai-evaluation-execution";

describe("local evaluation execution boundary", () => {
  test("keeps local judge output compact and rejects free-form results", () => {
    expect(parseLocalJudgeResult('{"score":0.8,"labels":["supported","incomplete"]}')).toEqual({
      score: 0.8,
      labels: ["supported", "incomplete"],
    });
    expect(() => parseLocalJudgeResult('{"score":0.8,"rationale":"private text"}')).toThrow("labels");
  });

  test("bounds the local judge packet without including structural trace identifiers", () => {
    const prompt = buildLocalJudgePrompt({
      redactedInput: "Approved question",
      expectedOutcome: "Use evidence",
      candidateOutput: "Answer",
      evidence: [{ documentPath: "private.md", chunkIndex: 0, text: "Private local evidence" }],
    });

    expect(prompt).toContain("Private local evidence");
    expect(prompt).not.toContain("traceId");
  });

  test("keeps local judge failure codes structural", () => {
    expect(classifyLocalJudgeFailure(new Error("Local evaluator returned invalid JSON"))).toBe("local_judge_invalid_response");
    expect(classifyLocalJudgeFailure(new Error("Ollama generation failed: 404"))).toBe("local_judge_unavailable");
  });

  test("preserves named Promptfoo metrics while deriving a compact aggregate score", () => {
    expect(parsePromptfooLocalJudgeResult(JSON.stringify({
      totalTokens: 42,
      cases: [{
        metrics: {
          "context-faithfulness": { score: 1, passed: true },
          "answer-relevance": { score: 0.5, passed: true },
        },
      }],
    }))).toEqual({
      totalTokens: 42,
      result: {
        score: 0.75,
        labels: ["promptfoo_context_faithfulness", "promptfoo_answer_relevance"],
        metrics: {
          "context-faithfulness": { score: 1, passed: true },
          "answer-relevance": { score: 0.5, passed: true },
        },
      },
    });
  });
});
