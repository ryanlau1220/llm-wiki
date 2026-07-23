/**
 * A deliberately small contract layer for future collaborator agents.
 *
 * This module validates what an agent is permitted to plan. It does not call
 * models, execute tools, write to a vault, or retain arbitrary tool output.
 */

export const AGENT_TOOL_EFFECT = {
  READ_ONLY: "read_only",
  APPROVAL_REQUIRED: "approval_required",
} as const;

export type AgentToolEffect = (typeof AGENT_TOOL_EFFECT)[keyof typeof AGENT_TOOL_EFFECT];

export const AGENT_PLAN_ISSUE_CODE = {
  AGENT_NOT_FOUND: "agent_not_found",
  APPROVAL_REQUIRED: "approval_required",
  INPUT_INVALID: "input_invalid",
  INVALID_BUDGET: "invalid_budget",
  TOOL_NOT_ALLOWED: "tool_not_allowed",
  TOOL_NOT_FOUND: "tool_not_found",
} as const;

export type AgentPlanIssueCode =
  (typeof AGENT_PLAN_ISSUE_CODE)[keyof typeof AGENT_PLAN_ISSUE_CODE];

export const AGENT_TOOL_RESULT_STATUS = {
  FAILED: "failed",
  SUCCEEDED: "succeeded",
} as const;

export type AgentToolResultStatus =
  (typeof AGENT_TOOL_RESULT_STATUS)[keyof typeof AGENT_TOOL_RESULT_STATUS];

export const AGENT_EVIDENCE_KIND = {
  CITATION: "citation",
  FACT: "fact",
  METRIC: "metric",
} as const;

export type AgentEvidenceKind =
  (typeof AGENT_EVIDENCE_KIND)[keyof typeof AGENT_EVIDENCE_KIND];

export type AgentToolSchemaIssue = {
  path: string;
  message: string;
};

export type AgentToolSchemaValidation<Input> =
  | { success: true; data: Input }
  | { success: false; issues: readonly AgentToolSchemaIssue[] };

/** A schema stays beside its tool contract and validates untrusted plan input. */
export type AgentToolSchema<Input> = {
  validate: (input: unknown) => AgentToolSchemaValidation<Input>;
};

export type AgentToolContract<Input = unknown> = {
  id: string;
  description: string;
  effect: AgentToolEffect;
  inputSchema: AgentToolSchema<Input>;
};

export type AgentExecutionBudget = {
  maxTurns: number;
  maxElapsedMs: number;
};

export type CollaboratorAgentDefinition = {
  id: string;
  allowedToolIds: readonly string[];
  budget: AgentExecutionBudget;
};

export type AgentRegistry = {
  agents: ReadonlyMap<string, CollaboratorAgentDefinition>;
  tools: ReadonlyMap<string, AgentToolContract>;
};

export type AgentExecutionStep = {
  toolId: string;
  input: unknown;
};

export type AgentExecutionPlan = {
  agentId: string;
  requestedTurns: number;
  timeoutMs: number;
  approvedToolIds: readonly string[];
  steps: readonly AgentExecutionStep[];
};

export type AgentPlanIssue = {
  code: AgentPlanIssueCode;
  message: string;
  stepIndex?: number;
};

export type ValidatedAgentExecutionStep = AgentExecutionStep & {
  effect: AgentToolEffect;
};

export type AgentPlanValidation =
  | {
    valid: true;
    plan: {
      agentId: string;
      requestedTurns: number;
      timeoutMs: number;
      steps: readonly ValidatedAgentExecutionStep[];
    };
  }
  | { valid: false; issues: readonly AgentPlanIssue[] };

export type AgentToolEvidence = {
  kind: AgentEvidenceKind;
  sourceId: string;
  claim: string;
  confidence?: number;
};

/**
 * This is intentionally evidence-only: callers cannot attach an arbitrary
 * provider response, hidden prompt, or raw tool payload to the trace.
 */
export type TraceReadyToolResult = {
  toolId: string;
  status: AgentToolResultStatus;
  durationMs: number;
  evidence: readonly AgentToolEvidence[];
  errorCode?: string;
};

export type TraceReadyToolResultInput = TraceReadyToolResult;

const MINIMUM_BUDGET = 1;
const MINIMUM_STEP_COUNT = 1;
const MAX_EVIDENCE_ITEMS = 100;
const MAX_EVIDENCE_CLAIM_LENGTH = 2_000;
const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 1;

export function createAgentRegistry(input: {
  agents: readonly CollaboratorAgentDefinition[];
  tools: readonly AgentToolContract[];
}): AgentRegistry {
  const tools = new Map<string, AgentToolContract>();
  for (const tool of input.tools) {
    validateToolContract(tool);
    if (tools.has(tool.id)) throw new Error(`Duplicate agent tool ID: ${tool.id}`);
    tools.set(tool.id, tool);
  }

  const agents = new Map<string, CollaboratorAgentDefinition>();
  for (const agent of input.agents) {
    validateAgentDefinition(agent, tools);
    if (agents.has(agent.id)) throw new Error(`Duplicate collaborator agent ID: ${agent.id}`);
    agents.set(agent.id, {
      ...agent,
      allowedToolIds: [...agent.allowedToolIds],
    });
  }

  return { agents, tools };
}

export function validateAgentExecutionPlan(
  registry: AgentRegistry,
  plan: AgentExecutionPlan,
): AgentPlanValidation {
  const agent = registry.agents.get(plan.agentId);
  if (!agent) {
    return invalidPlan([{
      code: AGENT_PLAN_ISSUE_CODE.AGENT_NOT_FOUND,
      message: `Unknown collaborator agent: ${plan.agentId}`,
    }]);
  }

  const issues = validatePlanBudget(plan, agent.budget);
  const approvedToolIds = new Set(plan.approvedToolIds);
  const validatedSteps: ValidatedAgentExecutionStep[] = [];

  plan.steps.forEach((step, stepIndex) => {
    const tool = registry.tools.get(step.toolId);
    if (!tool) {
      issues.push({
        code: AGENT_PLAN_ISSUE_CODE.TOOL_NOT_FOUND,
        message: `Unknown agent tool: ${step.toolId}`,
        stepIndex,
      });
      return;
    }

    if (!agent.allowedToolIds.includes(tool.id)) {
      issues.push({
        code: AGENT_PLAN_ISSUE_CODE.TOOL_NOT_ALLOWED,
        message: `Agent ${agent.id} is not allowed to use tool ${tool.id}`,
        stepIndex,
      });
      return;
    }

    if (tool.effect === AGENT_TOOL_EFFECT.APPROVAL_REQUIRED && !approvedToolIds.has(tool.id)) {
      issues.push({
        code: AGENT_PLAN_ISSUE_CODE.APPROVAL_REQUIRED,
        message: `Tool ${tool.id} requires explicit approval`,
        stepIndex,
      });
      return;
    }

    const schemaResult = tool.inputSchema.validate(step.input);
    if (!schemaResult.success) {
      issues.push({
        code: AGENT_PLAN_ISSUE_CODE.INPUT_INVALID,
        message: formatSchemaIssues(tool.id, schemaResult.issues),
        stepIndex,
      });
      return;
    }

    validatedSteps.push({ ...step, effect: tool.effect });
  });

  if (issues.length > 0) return invalidPlan(issues);

  return {
    valid: true,
    plan: {
      agentId: agent.id,
      requestedTurns: plan.requestedTurns,
      timeoutMs: plan.timeoutMs,
      steps: validatedSteps,
    },
  };
}

export function createTraceReadyToolResult(
  input: TraceReadyToolResultInput,
): TraceReadyToolResult {
  if (!input.toolId.trim()) throw new Error("Agent tool result requires a tool ID");
  validatePositiveInteger(input.durationMs, "Agent tool result duration");
  validateEvidence(input.evidence);

  if (input.status === AGENT_TOOL_RESULT_STATUS.FAILED && !input.errorCode?.trim()) {
    throw new Error("A failed agent tool result requires an error code");
  }

  if (input.status === AGENT_TOOL_RESULT_STATUS.SUCCEEDED && input.errorCode !== undefined) {
    throw new Error("A successful agent tool result cannot include an error code");
  }

  return {
    toolId: input.toolId,
    status: input.status,
    durationMs: input.durationMs,
    evidence: input.evidence.map((evidence) => ({ ...evidence })),
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
  };
}

function validateToolContract(tool: AgentToolContract): void {
  if (!tool.id.trim()) throw new Error("Agent tool ID is required");
  if (!tool.description.trim()) throw new Error(`Agent tool ${tool.id} requires a description`);
  if (!Object.values(AGENT_TOOL_EFFECT).includes(tool.effect)) {
    throw new Error(`Agent tool ${tool.id} has an invalid effect classification`);
  }
  if (typeof tool.inputSchema.validate !== "function") {
    throw new Error(`Agent tool ${tool.id} requires an input schema`);
  }
}

function validateAgentDefinition(
  agent: CollaboratorAgentDefinition,
  tools: ReadonlyMap<string, AgentToolContract>,
): void {
  if (!agent.id.trim()) throw new Error("Collaborator agent ID is required");
  validatePositiveInteger(agent.budget.maxTurns, `Agent ${agent.id} maximum turns`);
  validatePositiveInteger(agent.budget.maxElapsedMs, `Agent ${agent.id} maximum elapsed time`);

  for (const toolId of agent.allowedToolIds) {
    if (!tools.has(toolId)) throw new Error(`Agent ${agent.id} references unknown tool ${toolId}`);
  }
}

function validatePlanBudget(
  plan: AgentExecutionPlan,
  budget: AgentExecutionBudget,
): AgentPlanIssue[] {
  const issues: AgentPlanIssue[] = [];
  if (!isPositiveInteger(plan.requestedTurns) || plan.requestedTurns > budget.maxTurns) {
    issues.push({
      code: AGENT_PLAN_ISSUE_CODE.INVALID_BUDGET,
      message: `Requested turns must be a positive integer no greater than ${budget.maxTurns}`,
    });
  }
  if (!isPositiveInteger(plan.timeoutMs) || plan.timeoutMs > budget.maxElapsedMs) {
    issues.push({
      code: AGENT_PLAN_ISSUE_CODE.INVALID_BUDGET,
      message: `Timeout must be a positive integer no greater than ${budget.maxElapsedMs}ms`,
    });
  }
  if (plan.steps.length < MINIMUM_STEP_COUNT || plan.steps.length > plan.requestedTurns) {
    issues.push({
      code: AGENT_PLAN_ISSUE_CODE.INVALID_BUDGET,
      message: "Plan steps must be at least one and cannot exceed requested turns",
    });
  }
  return issues;
}

function validateEvidence(evidence: readonly AgentToolEvidence[]): void {
  if (evidence.length > MAX_EVIDENCE_ITEMS) {
    throw new Error(`Agent tool result cannot contain more than ${MAX_EVIDENCE_ITEMS} evidence items`);
  }

  for (const item of evidence) {
    if (!Object.values(AGENT_EVIDENCE_KIND).includes(item.kind)) {
      throw new Error("Agent evidence has an invalid kind");
    }
    if (!item.sourceId.trim()) throw new Error("Agent evidence requires a source ID");
    if (!item.claim.trim() || item.claim.length > MAX_EVIDENCE_CLAIM_LENGTH) {
      throw new Error(`Agent evidence claim must be between 1 and ${MAX_EVIDENCE_CLAIM_LENGTH} characters`);
    }
    if (item.confidence !== undefined && (!Number.isFinite(item.confidence)
      || item.confidence < MIN_CONFIDENCE || item.confidence > MAX_CONFIDENCE)) {
      throw new Error(`Agent evidence confidence must be between ${MIN_CONFIDENCE} and ${MAX_CONFIDENCE}`);
    }
  }
}

function validatePositiveInteger(value: number, label: string): void {
  if (!isPositiveInteger(value)) throw new Error(`${label} must be a positive integer`);
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value >= MINIMUM_BUDGET;
}

function formatSchemaIssues(toolId: string, issues: readonly AgentToolSchemaIssue[]): string {
  const detail = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `Input for tool ${toolId} is invalid${detail ? ` (${detail})` : ""}`;
}

function invalidPlan(issues: readonly AgentPlanIssue[]): AgentPlanValidation {
  return { valid: false, issues };
}
