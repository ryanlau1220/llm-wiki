import { describe, expect, test } from "bun:test";

import { buildLocalJudgePrompt, parseLocalJudgeResult } from "./ai-evaluation-execution";

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
});
