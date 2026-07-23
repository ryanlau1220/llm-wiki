import { describe, expect, test } from "bun:test";

import {
  AGENT_EVIDENCE_KIND,
  AGENT_PLAN_ISSUE_CODE,
  AGENT_TOOL_EFFECT,
  AGENT_TOOL_RESULT_STATUS,
  createAgentRegistry,
  createTraceReadyToolResult,
  type AgentToolSchema,
  validateAgentExecutionPlan,
} from "./registry";

const querySchema: AgentToolSchema<{ query: string }> = {
  validate(input) {
    if (!isRecord(input) || typeof input.query !== "string" || !input.query.trim()) {
      return {
        success: false,
        issues: [{ path: "query", message: "must be a non-empty string" }],
      };
    }

    return { success: true, data: { query: input.query } };
  },
};

const registry = createAgentRegistry({
  tools: [
    {
      id: "search_notes",
      description: "Search indexed notes without changing the vault.",
      effect: AGENT_TOOL_EFFECT.READ_ONLY,
      inputSchema: querySchema,
    },
    {
      id: "write_note",
      description: "Write a reviewed note to the vault.",
      effect: AGENT_TOOL_EFFECT.APPROVAL_REQUIRED,
      inputSchema: querySchema,
    },
  ],
  agents: [{
    id: "research_collaborator",
    allowedToolIds: ["search_notes", "write_note"],
    budget: { maxTurns: 2, maxElapsedMs: 5_000 },
  }],
});

const readOnlyRegistry = createAgentRegistry({
  tools: [
    {
      id: "search_notes",
      description: "Search indexed notes without changing the vault.",
      effect: AGENT_TOOL_EFFECT.READ_ONLY,
      inputSchema: querySchema,
    },
    {
      id: "write_note",
      description: "Write a reviewed note to the vault.",
      effect: AGENT_TOOL_EFFECT.APPROVAL_REQUIRED,
      inputSchema: querySchema,
    },
  ],
  agents: [{
    id: "read_only_collaborator",
    allowedToolIds: ["search_notes"],
    budget: { maxTurns: 1, maxElapsedMs: 1_000 },
  }],
});

describe("validateAgentExecutionPlan", () => {
  test("enforces declared turn and elapsed-time budgets", () => {
    const result = validateAgentExecutionPlan(registry, {
      agentId: "research_collaborator",
      requestedTurns: 3,
      timeoutMs: 5_001,
      approvedToolIds: [],
      steps: [{ toolId: "search_notes", input: { query: "local-first retrieval" } }],
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: AGENT_PLAN_ISSUE_CODE.INVALID_BUDGET,
          message: expect.stringContaining("2"),
        }),
        expect.objectContaining({
          code: AGENT_PLAN_ISSUE_CODE.INVALID_BUDGET,
          message: expect.stringContaining("5000ms"),
        }),
      ]));
    }
  });

  test("validates every tool input against its declared schema", () => {
    const invalidResult = validateAgentExecutionPlan(registry, {
      agentId: "research_collaborator",
      requestedTurns: 1,
      timeoutMs: 1_000,
      approvedToolIds: [],
      steps: [{ toolId: "search_notes", input: { query: 42 } }],
    });

    expect(invalidResult).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ code: AGENT_PLAN_ISSUE_CODE.INPUT_INVALID, stepIndex: 0 })],
    });

    const validResult = validateAgentExecutionPlan(registry, {
      agentId: "research_collaborator",
      requestedTurns: 1,
      timeoutMs: 1_000,
      approvedToolIds: [],
      steps: [{ toolId: "search_notes", input: { query: "local-first retrieval" } }],
    });

    expect(validResult).toMatchObject({
      valid: true,
      plan: {
        steps: [expect.objectContaining({ effect: AGENT_TOOL_EFFECT.READ_ONLY })],
      },
    });
  });

  test("requires explicit per-tool approval for side effects", () => {
    const withoutApproval = validateAgentExecutionPlan(registry, {
      agentId: "research_collaborator",
      requestedTurns: 1,
      timeoutMs: 1_000,
      approvedToolIds: [],
      steps: [{ toolId: "write_note", input: { query: "reviewed note" } }],
    });

    expect(withoutApproval).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ code: AGENT_PLAN_ISSUE_CODE.APPROVAL_REQUIRED, stepIndex: 0 })],
    });

    const withApproval = validateAgentExecutionPlan(registry, {
      agentId: "research_collaborator",
      requestedTurns: 1,
      timeoutMs: 1_000,
      approvedToolIds: ["write_note"],
      steps: [{ toolId: "write_note", input: { query: "reviewed note" } }],
    });

    expect(withApproval).toMatchObject({
      valid: true,
      plan: {
        steps: [expect.objectContaining({ effect: AGENT_TOOL_EFFECT.APPROVAL_REQUIRED })],
      },
    });

    const unauthorizedTool = validateAgentExecutionPlan(readOnlyRegistry, {
      agentId: "read_only_collaborator",
      requestedTurns: 1,
      timeoutMs: 1_000,
      approvedToolIds: ["write_note"],
      steps: [{ toolId: "write_note", input: { query: "reviewed note" } }],
    });

    expect(unauthorizedTool).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ code: AGENT_PLAN_ISSUE_CODE.TOOL_NOT_ALLOWED, stepIndex: 0 })],
    });
  });
});

describe("createTraceReadyToolResult", () => {
  test("preserves structured evidence without accepting arbitrary tool output", () => {
    const result = createTraceReadyToolResult({
      toolId: "search_notes",
      status: AGENT_TOOL_RESULT_STATUS.SUCCEEDED,
      durationMs: 25,
      evidence: [{
        kind: AGENT_EVIDENCE_KIND.CITATION,
        sourceId: "notes/local-first.md#0",
        claim: "The vault is queried before an answer is drafted.",
        confidence: 0.9,
      }],
    });

    expect(result).toEqual({
      toolId: "search_notes",
      status: AGENT_TOOL_RESULT_STATUS.SUCCEEDED,
      durationMs: 25,
      evidence: [expect.objectContaining({ sourceId: "notes/local-first.md#0" })],
    });
    expect(() => createTraceReadyToolResult({
      toolId: "search_notes",
      status: AGENT_TOOL_RESULT_STATUS.FAILED,
      durationMs: 25,
      evidence: [],
    })).toThrow("requires an error code");
    expect(() => createTraceReadyToolResult({
      toolId: "search_notes",
      status: AGENT_TOOL_RESULT_STATUS.SUCCEEDED,
      durationMs: 25,
      evidence: [{
        kind: AGENT_EVIDENCE_KIND.FACT,
        sourceId: "note-id",
        claim: "A fact",
        confidence: 1.1,
      }],
    })).toThrow("confidence");
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
