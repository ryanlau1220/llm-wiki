import { asc, desc, eq, sql } from "drizzle-orm";
import {
  AI_EVALUATOR_CONTRACT_VERSION,
  compareEvaluationRuns,
  evaluateDeterministicCase,
  type DeterministicEvaluation,
  validateAiEvaluationCase,
  validateEvaluationBudget,
} from "@llm-wiki/core";
import {
  aiEvaluationCases,
  aiEvaluationDatasets,
  aiEvaluationResults,
  aiEvaluationRuns,
  aiEvaluationSpans,
  createDbClient,
} from "@llm-wiki/db";
import type { AppConfig } from "./config";
import { buildAiEvaluationComparison } from "./ai-evaluation-comparison";
import {
  executeAskEvaluation,
  classifyLocalJudgeFailure,
  getLocalJudgeCapability,
  runLocalJudge,
} from "./ai-evaluation-execution";
import { generateLocalSilverCases } from "./ai-evaluation-synthetic";
import { buildAskWorkflowManifest } from "./ask";

const STATUS = { STARTED: "started", SUCCEEDED: "succeeded", FAILED: "failed" } as const;

type CreateDataset = {
  name: string; description?: string; approved: true;
  cases: Array<{ label: string; redactedInput: string; expectedEvidence: Array<{ documentPath: string; chunkIndex?: number }>; expectedOutcome?: string; referenceAnswer?: string; retrievedEvidence: Array<{ documentPath: string; chunkIndex?: number }>; retrievalEvidenceEvaluated: boolean; sourceTraceId?: string }>;
};

export async function createAiEvaluationDataset(config: AppConfig, input: CreateDataset) {
  if (input.approved !== true) throw new Error("Evaluation datasets require explicit owner approval");
  for (const [index, item] of input.cases.entries()) validateAiEvaluationCase({ id: `case-${index + 1}`, ...item });
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const [dataset] = await db.insert(aiEvaluationDatasets).values({ name: input.name, description: input.description }).returning();
  await db.insert(aiEvaluationCases).values(input.cases.map((item) => ({
    dataset_id: dataset.id, label: item.label, redacted_input: item.redactedInput,
    expected_evidence: item.expectedEvidence, expected_outcome: item.expectedOutcome,
    reference_answer: item.referenceAnswer,
    retrieved_evidence: item.retrievedEvidence,
    retrieval_evidence_evaluated: item.retrievalEvidenceEvaluated,
    source_trace_id: item.sourceTraceId,
  })));
  return formatDataset(dataset, { caseCount: input.cases.length, goldCaseCount: input.cases.length, silverCaseCount: 0 });
}

export async function listAiEvaluationDatasets(config: AppConfig) {
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const datasets = await db.select().from(aiEvaluationDatasets).orderBy(desc(aiEvaluationDatasets.approved_at));
  return Promise.all(datasets.map(async (dataset) => {
    const cases = await db.select({ lifecycle: aiEvaluationCases.lifecycle }).from(aiEvaluationCases).where(eq(aiEvaluationCases.dataset_id, dataset.id));
    return formatDataset(dataset, {
      caseCount: cases.length,
      goldCaseCount: cases.filter((item) => item.lifecycle === "gold").length,
      silverCaseCount: cases.filter((item) => item.lifecycle === "silver").length,
    });
  }));
}

/** Generates local-only candidates. They are never release-gating until explicitly promoted. */
export async function generateAiEvaluationCandidates(config: AppConfig, input: { maxCases: number }) {
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const candidates = await generateLocalSilverCases(config, db, input.maxCases);
  const [dataset] = await db.insert(aiEvaluationDatasets).values({
    name: `Local candidates ${new Date().toISOString().slice(0, 10)}`,
    description: null,
  }).returning();
  await db.insert(aiEvaluationCases).values(candidates.map((candidate) => ({
    dataset_id: dataset.id,
    label: candidate.label,
    redacted_input: candidate.redactedInput,
    expected_evidence: candidate.expectedEvidence,
    expected_outcome: candidate.expectedOutcome,
    retrieved_evidence: [],
    retrieval_evidence_evaluated: false,
    lifecycle: "silver",
    generation_metadata: candidate.generationMetadata,
  })));
  return formatDataset(dataset, { caseCount: candidates.length, goldCaseCount: 0, silverCaseCount: candidates.length });
}

export async function promoteAiEvaluationCase(config: AppConfig, input: { caseId: string }) {
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const [evaluationCase] = await db.select().from(aiEvaluationCases).where(eq(aiEvaluationCases.id, input.caseId)).limit(1);
  if (!evaluationCase) throw new Error("Evaluation case not found");
  if (evaluationCase.lifecycle === "gold") return { datasetId: evaluationCase.dataset_id, lifecycle: "gold" as const };
  await db.transaction(async (transaction) => {
    await transaction.update(aiEvaluationCases).set({ lifecycle: "gold", updated_at: new Date() }).where(eq(aiEvaluationCases.id, evaluationCase.id));
    await transaction.update(aiEvaluationDatasets).set({ version: sql`${aiEvaluationDatasets.version} + 1`, updated_at: new Date() }).where(eq(aiEvaluationDatasets.id, evaluationCase.dataset_id));
  });
  return { datasetId: evaluationCase.dataset_id, lifecycle: "gold" as const };
}

export async function runAiEvaluation(config: AppConfig, input: { datasetId: string; confirmTargetExecution: true; judgeEnabled: boolean; confirmLlmJudge: boolean; topK: number; maxCases: number; maxJudgeCalls: number; maxTotalTokens: number; rubricVersion: string }) {
  if (input.confirmTargetExecution !== true) throw new Error("Ask/RAG evaluation runs require explicit confirmation");
  if (input.judgeEnabled && !input.confirmLlmJudge) throw new Error("LLM judge runs require explicit confirmation");
  if (input.judgeEnabled && !getLocalJudgeCapability(config).localJudgeAvailable) {
    throw new Error("A configured local Ollama model is required for semantic evaluation");
  }
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const [dataset] = await db.select().from(aiEvaluationDatasets).where(eq(aiEvaluationDatasets.id, input.datasetId)).limit(1);
  if (!dataset) throw new Error("Evaluation dataset not found");
  const cases = await db.select().from(aiEvaluationCases).where(eq(aiEvaluationCases.dataset_id, dataset.id)).orderBy(asc(aiEvaluationCases.created_at));
  validateEvaluationBudget({ caseCount: cases.length, judgeEnabled: input.judgeEnabled, maxCases: input.maxCases, maxJudgeCalls: input.maxJudgeCalls, maxTotalTokens: input.maxTotalTokens });

  const localJudge = getLocalJudgeCapability(config);
  const workflowManifest = buildAskWorkflowManifest(config, input.topK);
  const [run] = await db.insert(aiEvaluationRuns).values({
    dataset_id: dataset.id, dataset_version: dataset.version, evaluator_contract_version: AI_EVALUATOR_CONTRACT_VERSION,
    rubric_version: input.rubricVersion, judge_enabled: input.judgeEnabled,
    model_provider: input.judgeEnabled ? "ollama" : null, model_name: input.judgeEnabled ? localJudge.localJudgeModel : null,
    max_cases: input.maxCases, max_judge_calls: input.maxJudgeCalls, max_total_tokens: input.maxTotalTokens,
    workflow_manifest: workflowManifest, status: STATUS.STARTED,
  }).returning();
  const startedAt = Date.now();
  const rootSpanId = await startSpan(db, run.id, "evaluation", { case_count: cases.length, judge_enabled: input.judgeEnabled, contract_version: AI_EVALUATOR_CONTRACT_VERSION });
  let totalTokens = 0;
  let judgeCalls = 0;
  let failedCases = 0;
  for (const [caseIndex, evaluationCase] of cases.entries()) {
    const caseStartedAt = Date.now();
    const caseSpanId = await startSpan(db, run.id, "case", { case_number: caseIndex + 1 }, rootSpanId);
    let status: "succeeded" | "failed" = STATUS.SUCCEEDED;
    let deterministic: DeterministicEvaluation & { execution: Record<string, string | number | boolean | null> } = failedExecutionDeterministic(evaluationCase);
    let executionTraceId: string | null = null;
    let judge: { score: number; labels: string[] } | null = null;
    let executionSpanId: string | null = null;
    let targetExecutionSucceeded = false;
    let judgeAttempted = false;
    let targetPromptTokens: number | null = null;
    let targetCandidateTokens: number | null = null;
    let totalCaseTokens: number | null = null;
    let errorCode: string | null = null;
    try {
      const executionStartedAt = Date.now();
      executionSpanId = await startSpan(db, run.id, "target_execution", { target: "ask_rag", top_k: input.topK }, caseSpanId);
      const execution = await executeAskEvaluation(config, { redactedInput: evaluationCase.redacted_input, topK: input.topK });
      executionTraceId = execution.traceId;
      targetPromptTokens = execution.trace.promptTokens;
      targetCandidateTokens = execution.trace.candidateTokens;
      totalCaseTokens = execution.trace.totalTokens;
      totalTokens += execution.trace.totalTokens ?? 0;
      deterministic = {
        ...evaluateDeterministicCase({
          id: evaluationCase.id,
          redactedInput: evaluationCase.redacted_input,
          expectedEvidence: evaluationCase.expected_evidence as Array<{ documentPath: string; chunkIndex?: number }>,
          expectedOutcome: evaluationCase.expected_outcome,
          referenceAnswer: evaluationCase.reference_answer,
          candidateOutput: execution.candidateOutput,
          retrievedEvidence: execution.retrievedEvidence,
          retrievalEvaluated: true,
          citedEvidence: execution.citedEvidence,
        }),
        execution: {
          status: execution.trace.status,
          policy: execution.trace.policy,
          candidate_count: execution.trace.candidateCount,
          selected_evidence_count: execution.trace.selectedEvidenceCount,
          context_character_count: execution.trace.contextCharacterCount,
          duration_ms: execution.trace.durationMs,
          citation_count: execution.trace.citationCount,
        },
      };
      await completeSpan(db, executionSpanId, STATUS.SUCCEEDED, Date.now() - executionStartedAt, {
        selected_evidence_count: execution.trace.selectedEvidenceCount,
        citation_count: execution.trace.citationCount,
        total_tokens: execution.trace.totalTokens,
      });
      targetExecutionSucceeded = true;

      if (input.judgeEnabled) {
        if (judgeCalls >= input.maxJudgeCalls || totalTokens >= input.maxTotalTokens) {
          throw new Error("judge_budget_exhausted");
        }
        const judgeStartedAt = Date.now();
        const judgeSpanId = await startSpan(db, run.id, "local_judge", { rubric_version: input.rubricVersion, max_output_tokens: 256 }, caseSpanId);
        judgeAttempted = true;
        try {
          const localResult = await runLocalJudge(config, {
            redactedInput: evaluationCase.redacted_input,
            expectedOutcome: evaluationCase.expected_outcome,
            candidateOutput: execution.candidateOutput,
            evidence: execution.localJudgeEvidence,
          });
          judge = localResult.result;
          judgeCalls += 1;
          totalCaseTokens = (totalCaseTokens ?? 0) + (localResult.totalTokens ?? 0);
          totalTokens += localResult.totalTokens ?? 0;
          await completeSpan(db, judgeSpanId, STATUS.SUCCEEDED, Date.now() - judgeStartedAt, localResult.totalTokens === null ? {} : { total_tokens: localResult.totalTokens });
        } catch (error) {
          const errorCode = classifyLocalJudgeFailure(error);
          await completeSpan(db, judgeSpanId, STATUS.FAILED, Date.now() - judgeStartedAt, {}, errorCode);
          throw new Error(errorCode);
        }
      }
    } catch (error) {
      if (executionSpanId && !targetExecutionSucceeded) {
        await completeSpan(
          db,
          executionSpanId,
          STATUS.FAILED,
          Date.now() - caseStartedAt,
          {},
          "target_execution_failed",
        );
      }
      status = STATUS.FAILED;
      errorCode = error instanceof Error && error.message === "judge_budget_exhausted"
        ? "judge_budget_exhausted"
        : error instanceof Error && (error.message === "local_judge_invalid_response" || error.message === "local_judge_unavailable")
          ? error.message
          : judgeAttempted
            ? "local_judge_unavailable"
          : "target_execution_failed";
      failedCases += 1;
    }
    await db.insert(aiEvaluationResults).values({ evaluation_run_id: run.id, evaluation_case_id: evaluationCase.id, status, deterministic, execution_trace_id: executionTraceId, judge_score: judge?.score ?? null, judge_labels: judge?.labels ?? [], judge_rationale: null, prompt_tokens: targetPromptTokens, candidate_tokens: targetCandidateTokens, total_tokens: totalCaseTokens, error_code: errorCode });
    await completeSpan(db, caseSpanId, status, Date.now() - caseStartedAt, { deterministic: true }, errorCode ?? undefined);
  }
  const durationMs = Date.now() - startedAt;
  const runStatus = failedCases > 0 ? STATUS.FAILED : STATUS.SUCCEEDED;
  await completeSpan(db, rootSpanId, runStatus, durationMs, { judge_calls: judgeCalls, total_tokens: totalTokens, failed_cases: failedCases }, runStatus === STATUS.FAILED ? "case_evaluation_failed" : undefined);
  const [completed] = await db.update(aiEvaluationRuns).set({ status: runStatus, error_code: runStatus === STATUS.FAILED ? "case_evaluation_failed" : null, summary: { caseCount: cases.length, judgeCalls, totalTokens, failedCases }, completed_at: new Date(), duration_ms: durationMs }).where(eq(aiEvaluationRuns.id, run.id)).returning();
  return getAiEvaluationRunFromDb(db, completed.id) as Promise<NonNullable<Awaited<ReturnType<typeof getAiEvaluationRunFromDb>>>>;
}

export function getAiEvaluationCapabilities(config: AppConfig) {
  return getLocalJudgeCapability(config);
}

export async function listAiEvaluationRuns(config: AppConfig, datasetId?: string) {
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const runs = datasetId ? await db.select().from(aiEvaluationRuns).where(eq(aiEvaluationRuns.dataset_id, datasetId)).orderBy(desc(aiEvaluationRuns.started_at)) : await db.select().from(aiEvaluationRuns).orderBy(desc(aiEvaluationRuns.started_at));
  const hydratedRuns = await Promise.all(runs.map((run) => getAiEvaluationRunFromDb(db, run.id)));
  return hydratedRuns.filter(isPresent);
}

export async function getAiEvaluationRun(config: AppConfig, runId: string) {
  const { db } = createDbClient(requiredDatabaseUrl(config));
  return getAiEvaluationRunFromDb(db, runId);
}

export async function compareAiEvaluationRuns(config: AppConfig, input: { baselineRunId: string; candidateRunId: string }) {
  if (input.baselineRunId === input.candidateRunId) throw new Error("Select two distinct evaluation runs");
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const [baseline, candidate] = await Promise.all([getAiEvaluationRunFromDb(db, input.baselineRunId), getAiEvaluationRunFromDb(db, input.candidateRunId)]);
  if (!baseline || !candidate) throw new Error("Evaluation run not found");
  const comparison = compareEvaluationRuns(
    { id: baseline.id, results: baseline.results.map((result) => ({ status: result.status, deterministic: result.deterministic as unknown as DeterministicEvaluation, judgeScore: result.judgeScore })) },
    { id: candidate.id, results: candidate.results.map((result) => ({ status: result.status, deterministic: result.deterministic as unknown as DeterministicEvaluation, judgeScore: result.judgeScore })) },
  );
  return buildAiEvaluationComparison(baseline, candidate, comparison);
}

async function getAiEvaluationRunFromDb(db: ReturnType<typeof createDbClient>["db"], runId: string) {
  const [run] = await db.select().from(aiEvaluationRuns).where(eq(aiEvaluationRuns.id, runId)).limit(1);
  if (!run) return null;
  const [dataset] = await db.select().from(aiEvaluationDatasets).where(eq(aiEvaluationDatasets.id, run.dataset_id)).limit(1);
  const results = await db.select().from(aiEvaluationResults).where(eq(aiEvaluationResults.evaluation_run_id, run.id)).orderBy(asc(aiEvaluationResults.created_at));
  const spans = await db.select().from(aiEvaluationSpans).where(eq(aiEvaluationSpans.evaluation_run_id, run.id)).orderBy(asc(aiEvaluationSpans.started_at));
  return {
    id: run.id, datasetId: run.dataset_id, datasetName: dataset?.name ?? "Deleted dataset", datasetVersion: run.dataset_version, evaluatorContractVersion: run.evaluator_contract_version, rubricVersion: run.rubric_version, judgeEnabled: run.judge_enabled, modelProvider: run.model_provider, modelName: run.model_name, maxCases: run.max_cases, maxJudgeCalls: run.max_judge_calls, maxTotalTokens: run.max_total_tokens, workflowManifest: run.workflow_manifest as Record<string, unknown>, status: run.status as "started" | "succeeded" | "failed", errorCode: run.error_code, summary: run.summary as Record<string, unknown>, startedAt: run.started_at.toISOString(), completedAt: run.completed_at?.toISOString() ?? null, durationMs: run.duration_ms,
    results: results.map((result) => ({ id: result.id, caseId: result.evaluation_case_id, status: result.status as "succeeded" | "failed", deterministic: result.deterministic as Record<string, unknown>, executionTraceId: result.execution_trace_id, judgeScore: result.judge_score, judgeLabels: result.judge_labels as string[], promptTokens: result.prompt_tokens, candidateTokens: result.candidate_tokens, totalTokens: result.total_tokens, errorCode: result.error_code, createdAt: result.created_at.toISOString() })),
    spans: spans.map((span) => ({ id: span.id, parentSpanId: span.parent_span_id, spanType: span.span_type, status: span.status as "started" | "succeeded" | "failed", attributes: span.attributes as Record<string, string | number | boolean | null>, errorCode: span.error_code, startedAt: span.started_at.toISOString(), completedAt: span.completed_at?.toISOString() ?? null, durationMs: span.duration_ms })),
  };
}

export function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function formatDataset(
  dataset: typeof aiEvaluationDatasets.$inferSelect,
  counts: { caseCount: number; goldCaseCount: number; silverCaseCount: number },
) {
  return {
    id: dataset.id,
    name: dataset.name,
    description: dataset.description,
    version: dataset.version,
    approvedAt: dataset.approved_at.toISOString(),
    createdAt: dataset.created_at.toISOString(),
    ...counts,
  };
}
function failedExecutionDeterministic(evaluationCase: typeof aiEvaluationCases.$inferSelect) {
  return {
    ...evaluateDeterministicCase({
      id: evaluationCase.id,
      redactedInput: evaluationCase.redacted_input,
      expectedEvidence: evaluationCase.expected_evidence as Array<{ documentPath: string; chunkIndex?: number }>,
      expectedOutcome: evaluationCase.expected_outcome,
      referenceAnswer: evaluationCase.reference_answer,
      retrievedEvidence: [],
      retrievalEvaluated: false,
    }),
    execution: { status: "failed", policy: "vault_hybrid", candidate_count: 0, selected_evidence_count: 0, context_character_count: 0, duration_ms: null, citation_count: 0 },
  };
}
function requiredDatabaseUrl(config: AppConfig) { if (!config.databaseUrl) throw new Error("DATABASE_URL is required for AI evaluation"); return config.databaseUrl; }
async function startSpan(db: ReturnType<typeof createDbClient>["db"], runId: string, spanType: string, attributes: Record<string, string | number | boolean | null>, parentSpanId?: string) { const [span] = await db.insert(aiEvaluationSpans).values({ evaluation_run_id: runId, parent_span_id: parentSpanId, span_type: spanType, status: STATUS.STARTED, attributes }).returning({ id: aiEvaluationSpans.id }); return span.id; }
async function completeSpan(db: ReturnType<typeof createDbClient>["db"], spanId: string, status: "succeeded" | "failed", durationMs: number, attributes: Record<string, string | number | boolean | null>, errorCode?: string) { await db.update(aiEvaluationSpans).set({ status, duration_ms: durationMs, completed_at: new Date(), attributes, error_code: errorCode ?? null }).where(eq(aiEvaluationSpans.id, spanId)); }
