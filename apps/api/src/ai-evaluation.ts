import { asc, desc, eq } from "drizzle-orm";
import { createLLMProvider, type LLMProvider } from "@llm-wiki/ai";
import {
  AI_EVALUATOR_CONTRACT_VERSION,
  evaluateDeterministicCase,
  parseJudgeEvaluation,
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

const STATUS = { STARTED: "started", SUCCEEDED: "succeeded", FAILED: "failed" } as const;

type CreateDataset = {
  name: string; description?: string; approved: true;
  cases: Array<{ label: string; redactedInput: string; expectedEvidence: Array<{ documentPath: string; chunkIndex?: number }>; expectedOutcome?: string; referenceAnswer?: string; candidateOutput?: string; retrievedEvidence: Array<{ documentPath: string; chunkIndex?: number }>; sourceTraceId?: string }>;
};

export async function createAiEvaluationDataset(config: AppConfig, input: CreateDataset) {
  if (input.approved !== true) throw new Error("Evaluation datasets require explicit owner approval");
  for (const [index, item] of input.cases.entries()) validateAiEvaluationCase({ id: `case-${index + 1}`, ...item });
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const [dataset] = await db.insert(aiEvaluationDatasets).values({ name: input.name, description: input.description }).returning();
  await db.insert(aiEvaluationCases).values(input.cases.map((item) => ({
    dataset_id: dataset.id, label: item.label, redacted_input: item.redactedInput,
    expected_evidence: item.expectedEvidence, expected_outcome: item.expectedOutcome,
    reference_answer: item.referenceAnswer, candidate_output: item.candidateOutput,
    retrieved_evidence: item.retrievedEvidence, source_trace_id: item.sourceTraceId,
  })));
  return formatDataset(dataset, input.cases.length);
}

export async function listAiEvaluationDatasets(config: AppConfig) {
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const datasets = await db.select().from(aiEvaluationDatasets).orderBy(desc(aiEvaluationDatasets.approved_at));
  return Promise.all(datasets.map(async (dataset) => {
    const cases = await db.select({ id: aiEvaluationCases.id }).from(aiEvaluationCases).where(eq(aiEvaluationCases.dataset_id, dataset.id));
    return formatDataset(dataset, cases.length);
  }));
}

export async function runAiEvaluation(config: AppConfig, input: { datasetId: string; judgeEnabled: boolean; confirmLlmJudge: boolean; maxCases: number; maxJudgeCalls: number; maxTotalTokens: number; rubricVersion: string }) {
  if (input.judgeEnabled && !input.confirmLlmJudge) throw new Error("LLM judge runs require explicit confirmation");
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const [dataset] = await db.select().from(aiEvaluationDatasets).where(eq(aiEvaluationDatasets.id, input.datasetId)).limit(1);
  if (!dataset) throw new Error("Evaluation dataset not found");
  const cases = await db.select().from(aiEvaluationCases).where(eq(aiEvaluationCases.dataset_id, dataset.id)).orderBy(asc(aiEvaluationCases.created_at));
  validateEvaluationBudget({ caseCount: cases.length, judgeEnabled: input.judgeEnabled, maxCases: input.maxCases, maxJudgeCalls: input.maxJudgeCalls, maxTotalTokens: input.maxTotalTokens });

  const provider = input.judgeEnabled ? buildProvider(config) : null;
  const [run] = await db.insert(aiEvaluationRuns).values({
    dataset_id: dataset.id, dataset_version: dataset.version, evaluator_contract_version: AI_EVALUATOR_CONTRACT_VERSION,
    rubric_version: input.rubricVersion, judge_enabled: input.judgeEnabled,
    model_provider: provider ? config.embeddingProvider : null, model_name: provider ? modelName(provider) : null,
    max_cases: input.maxCases, max_judge_calls: input.maxJudgeCalls, max_total_tokens: input.maxTotalTokens, status: STATUS.STARTED,
  }).returning();
  const startedAt = Date.now();
  const rootSpanId = await startSpan(db, run.id, "evaluation", { case_count: cases.length, judge_enabled: input.judgeEnabled, contract_version: AI_EVALUATOR_CONTRACT_VERSION });
  let totalTokens = 0;
  let judgeCalls = 0;
  let failedCases = 0;
  for (const evaluationCase of cases) {
    const caseStartedAt = Date.now();
    const caseSpanId = await startSpan(db, run.id, "case", { case_number: judgeCalls + 1 }, rootSpanId);
    const deterministic = evaluateDeterministicCase({ id: evaluationCase.id, redactedInput: evaluationCase.redacted_input, expectedEvidence: evaluationCase.expected_evidence as Array<{ documentPath: string; chunkIndex?: number }>, expectedOutcome: evaluationCase.expected_outcome, referenceAnswer: evaluationCase.reference_answer, candidateOutput: evaluationCase.candidate_output, retrievedEvidence: evaluationCase.retrieved_evidence as Array<{ documentPath: string; chunkIndex?: number }> });
    let status: "succeeded" | "failed" = STATUS.SUCCEEDED;
    let judge: { score: number; rationale: string } | null = null;
    let usage: { promptTokens: number; candidatesTokens: number; totalTokens: number } | undefined;
    let errorCode: string | null = null;
    if (provider) {
      if (judgeCalls >= input.maxJudgeCalls || totalTokens >= input.maxTotalTokens) {
        status = STATUS.FAILED; errorCode = "judge_budget_exhausted"; failedCases += 1;
      } else {
        const judgeStartedAt = Date.now();
        const judgeSpanId = await startSpan(db, run.id, "llm_judge", { rubric_version: input.rubricVersion, max_output_tokens: 512 }, caseSpanId);
        try {
          const response = await provider.generate({ prompt: judgePrompt(evaluationCase), systemInstruction: "You are a bounded evaluation agent. Score only supplied redacted data. Return JSON with score (0 to 1) and a short rationale. Do not reveal chain-of-thought.", responseMimeType: "application/json", temperature: 0, maxOutputTokens: 512 });
          judge = parseJudgeEvaluation(response.text); usage = response.usage; judgeCalls += 1; totalTokens += response.usage?.totalTokens ?? 0;
          await completeSpan(db, judgeSpanId, STATUS.SUCCEEDED, Date.now() - judgeStartedAt, usage ? { total_tokens: usage.totalTokens } : {});
        } catch (error) {
          status = STATUS.FAILED; errorCode = "judge_failed"; failedCases += 1;
          await completeSpan(db, judgeSpanId, STATUS.FAILED, Date.now() - judgeStartedAt, {}, "judge_failed");
        }
      }
    }
    await db.insert(aiEvaluationResults).values({ evaluation_run_id: run.id, evaluation_case_id: evaluationCase.id, status, deterministic, judge_score: judge?.score ?? null, judge_rationale: judge?.rationale ?? null, prompt_tokens: usage?.promptTokens ?? null, candidate_tokens: usage?.candidatesTokens ?? null, total_tokens: usage?.totalTokens ?? null, error_code: errorCode });
    await completeSpan(db, caseSpanId, status, Date.now() - caseStartedAt, { deterministic: true }, errorCode ?? undefined);
  }
  const durationMs = Date.now() - startedAt;
  const runStatus = failedCases > 0 ? STATUS.FAILED : STATUS.SUCCEEDED;
  await completeSpan(db, rootSpanId, runStatus, durationMs, { judge_calls: judgeCalls, total_tokens: totalTokens, failed_cases: failedCases }, runStatus === STATUS.FAILED ? "case_evaluation_failed" : undefined);
  const [completed] = await db.update(aiEvaluationRuns).set({ status: runStatus, error_code: runStatus === STATUS.FAILED ? "case_evaluation_failed" : null, summary: { caseCount: cases.length, judgeCalls, totalTokens, failedCases }, completed_at: new Date(), duration_ms: durationMs }).where(eq(aiEvaluationRuns.id, run.id)).returning();
  return getAiEvaluationRunFromDb(db, completed.id) as Promise<NonNullable<Awaited<ReturnType<typeof getAiEvaluationRunFromDb>>>>;
}

export async function listAiEvaluationRuns(config: AppConfig, datasetId?: string) {
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const runs = datasetId ? await db.select().from(aiEvaluationRuns).where(eq(aiEvaluationRuns.dataset_id, datasetId)).orderBy(desc(aiEvaluationRuns.started_at)) : await db.select().from(aiEvaluationRuns).orderBy(desc(aiEvaluationRuns.started_at));
  return Promise.all(runs.map((run) => getAiEvaluationRunFromDb(db, run.id)));
}

export async function getAiEvaluationRun(config: AppConfig, runId: string) {
  const { db } = createDbClient(requiredDatabaseUrl(config));
  return getAiEvaluationRunFromDb(db, runId);
}

async function getAiEvaluationRunFromDb(db: ReturnType<typeof createDbClient>["db"], runId: string) {
  const [run] = await db.select().from(aiEvaluationRuns).where(eq(aiEvaluationRuns.id, runId)).limit(1);
  if (!run) return null;
  const [dataset] = await db.select().from(aiEvaluationDatasets).where(eq(aiEvaluationDatasets.id, run.dataset_id)).limit(1);
  const results = await db.select().from(aiEvaluationResults).where(eq(aiEvaluationResults.evaluation_run_id, run.id)).orderBy(asc(aiEvaluationResults.created_at));
  const spans = await db.select().from(aiEvaluationSpans).where(eq(aiEvaluationSpans.evaluation_run_id, run.id)).orderBy(asc(aiEvaluationSpans.started_at));
  return {
    id: run.id, datasetId: run.dataset_id, datasetName: dataset?.name ?? "Deleted dataset", datasetVersion: run.dataset_version, evaluatorContractVersion: run.evaluator_contract_version, rubricVersion: run.rubric_version, judgeEnabled: run.judge_enabled, modelProvider: run.model_provider, modelName: run.model_name, maxCases: run.max_cases, maxJudgeCalls: run.max_judge_calls, maxTotalTokens: run.max_total_tokens, status: run.status as "started" | "succeeded" | "failed", errorCode: run.error_code, summary: run.summary as Record<string, unknown>, startedAt: run.started_at.toISOString(), completedAt: run.completed_at?.toISOString() ?? null, durationMs: run.duration_ms,
    results: results.map((result) => ({ id: result.id, caseId: result.evaluation_case_id, status: result.status as "succeeded" | "failed", deterministic: result.deterministic as Record<string, unknown>, judgeScore: result.judge_score, judgeRationale: result.judge_rationale, promptTokens: result.prompt_tokens, candidateTokens: result.candidate_tokens, totalTokens: result.total_tokens, errorCode: result.error_code, createdAt: result.created_at.toISOString() })),
    spans: spans.map((span) => ({ id: span.id, parentSpanId: span.parent_span_id, spanType: span.span_type, status: span.status as "started" | "succeeded" | "failed", attributes: span.attributes as Record<string, string | number | boolean | null>, errorCode: span.error_code, startedAt: span.started_at.toISOString(), completedAt: span.completed_at?.toISOString() ?? null, durationMs: span.duration_ms })),
  };
}

function formatDataset(dataset: typeof aiEvaluationDatasets.$inferSelect, caseCount: number) { return { id: dataset.id, name: dataset.name, description: dataset.description, version: dataset.version, approvedAt: dataset.approved_at.toISOString(), createdAt: dataset.created_at.toISOString(), caseCount }; }
function requiredDatabaseUrl(config: AppConfig) { if (!config.databaseUrl) throw new Error("DATABASE_URL is required for AI evaluation"); return config.databaseUrl; }
function buildProvider(config: AppConfig) { return createLLMProvider({ provider: config.embeddingProvider, geminiGeap: { projectId: config.gcpProjectId, location: config.gcpLocation, model: config.gcpLlmModel }, openai: { apiKey: config.openaiApiKey, baseUrl: config.openaiBaseUrl, model: config.openaiLlmModel }, ollama: { baseUrl: config.ollamaBaseUrl, model: config.ollamaLlmModel } }); }
function modelName(provider: LLMProvider) { return typeof (provider as { model?: unknown }).model === "string" ? (provider as { model: string }).model : null; }
function judgePrompt(item: typeof aiEvaluationCases.$inferSelect) { return JSON.stringify({ redactedInput: item.redacted_input, expectedEvidence: item.expected_evidence, expectedOutcome: item.expected_outcome, referenceAnswer: item.reference_answer, candidateOutput: item.candidate_output, retrievedEvidence: item.retrieved_evidence }); }
async function startSpan(db: ReturnType<typeof createDbClient>["db"], runId: string, spanType: string, attributes: Record<string, string | number | boolean | null>, parentSpanId?: string) { const [span] = await db.insert(aiEvaluationSpans).values({ evaluation_run_id: runId, parent_span_id: parentSpanId, span_type: spanType, status: STATUS.STARTED, attributes }).returning({ id: aiEvaluationSpans.id }); return span.id; }
async function completeSpan(db: ReturnType<typeof createDbClient>["db"], spanId: string, status: "succeeded" | "failed", durationMs: number, attributes: Record<string, string | number | boolean | null>, errorCode?: string) { await db.update(aiEvaluationSpans).set({ status, duration_ms: durationMs, completed_at: new Date(), attributes, error_code: errorCode ?? null }).where(eq(aiEvaluationSpans.id, spanId)); }
