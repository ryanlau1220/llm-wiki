import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  AI_EVALUATOR_CONTRACT_VERSION,
  compareEvaluationRuns,
  evaluateDeterministicCase,
  getAiTrace,
  type DeterministicEvaluation,
  validateEvaluationBudget,
} from "@llm-wiki/core";
import {
  aiEvaluationCases,
  aiEvaluationDatasets,
  aiEvaluationResults,
  aiEvaluationRuns,
  aiEvaluationSpans,
  aiTraceFeedback,
  chunks,
  createDbClient,
  documents,
} from "@llm-wiki/db";
import type { AppConfig } from "./config";
import { buildAiEvaluationComparison } from "./ai-evaluation-comparison";
import {
  executeAskEvaluation,
  executeRetrievalEvaluation,
  classifySemanticJudgeFailure,
  getSemanticJudgeCapability,
  getSemanticJudgeRuntimeCapability,
  runLocalJudge,
  runCloudJudge,
  type LocalJudgeResult,
} from "./ai-evaluation-execution";
import { generateDeterministicBaselineSuite } from "./ai-evaluation-synthetic";
import { buildAskWorkflowManifest } from "./ask";

const STATUS = {
  QUEUED: "queued",
  RUNNING: "running",
  STARTED: "started",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
} as const;
export const GOLDEN_SUITE_NAME = "Golden Suite v1";
const LEGACY_RETRIEVAL_CANARY_NAME = "Retrieval Canaries v1";
const LEGACY_GENERATED_BASELINE_NAME = "Generated Baseline v2";
const LEGACY_GENERATED_BASELINE_V1_NAME = "Generated Baseline v1";
const GOLDEN_SUITE_DESCRIPTION =
  "System-maintained, versioned retrieval baseline for this vault. It verifies expected indexed evidence without sending vault content to an evaluator. Owner-validated feedback can add optional answer-quality checks.";
const AUTOMATIC_BASELINE_MAX_CASES = 12;

type EvaluationInput = {
  /** Omit to create or reuse the app-owned retrieval baseline. */
  datasetId?: string;
  confirmTargetExecution: true;
  judgeEnabled: boolean;
  confirmLlmJudge: boolean;
  topK: number;
  maxCases: number;
  maxJudgeCalls: number;
  maxTotalTokens: number;
  rubricVersion: string;
};

type PreparedEvaluation = {
  db: ReturnType<typeof createDbClient>["db"];
  dataset: typeof aiEvaluationDatasets.$inferSelect;
  cases: Array<typeof aiEvaluationCases.$inferSelect>;
  judgeCapability: ReturnType<typeof getSemanticJudgeCapability>;
  /** Semantic evaluation is reserved for owner-validated gold cases. */
  judgeEnabled: boolean;
  semanticGoldCaseCount: number;
  run: typeof aiEvaluationRuns.$inferSelect;
};

type EvaluationCaseLifecycle = "baseline" | "candidate" | "gold" | "retired";

export async function listAiEvaluationDatasets(config: AppConfig) {
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const datasets = await db
    .select()
    .from(aiEvaluationDatasets)
    .orderBy(desc(aiEvaluationDatasets.approved_at));
  return Promise.all(
    datasets
      .filter((dataset) => !isLegacyGeneratedBaseline(dataset.name))
      .map(async (dataset) => {
        const cases = await db
          .select({ lifecycle: aiEvaluationCases.lifecycle })
          .from(aiEvaluationCases)
          .where(eq(aiEvaluationCases.dataset_id, dataset.id));
        return formatDataset(dataset, datasetCaseCounts(cases));
      }),
  );
}

export async function getAiEvaluationDataset(config: AppConfig, datasetId: string) {
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const [dataset] = await db
    .select()
    .from(aiEvaluationDatasets)
    .where(eq(aiEvaluationDatasets.id, datasetId))
    .limit(1);
  if (!dataset) throw new Error("Evaluation dataset not found");
  const cases = await db
    .select({ lifecycle: aiEvaluationCases.lifecycle })
    .from(aiEvaluationCases)
    .where(eq(aiEvaluationCases.dataset_id, dataset.id));
  return formatDataset(dataset, datasetCaseCounts(cases));
}

export async function listAiEvaluationCases(config: AppConfig, input: { datasetId: string }) {
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const cases = await db
    .select({
      id: aiEvaluationCases.id,
      label: aiEvaluationCases.label,
      lifecycle: aiEvaluationCases.lifecycle,
      expectedEvidence: aiEvaluationCases.expected_evidence,
      expectedOutcome: aiEvaluationCases.expected_outcome,
    })
    .from(aiEvaluationCases)
    .where(
      and(
        eq(aiEvaluationCases.dataset_id, input.datasetId),
        inArray(aiEvaluationCases.lifecycle, ["baseline", "candidate", "gold"]),
      ),
    )
    .orderBy(asc(aiEvaluationCases.created_at));
  return cases.flatMap((evaluationCase) => {
    const lifecycle = normalizeEvaluationCaseLifecycle(evaluationCase.lifecycle);
    if (lifecycle === "retired") return [];
    return [
      {
        id: evaluationCase.id,
        label: evaluationCase.label,
        lifecycle,
        expectedEvidence: evaluationCase.expectedEvidence as Array<{
          documentPath: string;
          chunkIndex?: number;
        }>,
        expectedOutcome: evaluationCase.expectedOutcome,
      },
    ];
  });
}

/**
 * Creates the app-owned Golden Suite on first use. Its retrieval baseline is
 * intentionally stable: normal note edits and different CLI/UI limits do not
 * rewrite it. The baseline refreshes only when one of its expected sources is
 * no longer indexed, while historical results keep their original version.
 */
export async function ensureAiEvaluationBaseline(config: AppConfig, input: { maxCases: number }) {
  const { db } = createDbClient(requiredDatabaseUrl(config));
  // The run limit is deliberately not the suite size. A smoke check and the
  // UI must exercise the same stable source set.
  void input;
  const existingDatasets = await db
    .select()
    .from(aiEvaluationDatasets)
    .where(
      inArray(aiEvaluationDatasets.name, [
        GOLDEN_SUITE_NAME,
        LEGACY_RETRIEVAL_CANARY_NAME,
        LEGACY_GENERATED_BASELINE_NAME,
        LEGACY_GENERATED_BASELINE_V1_NAME,
      ]),
    )
    .orderBy(desc(aiEvaluationDatasets.updated_at));
  const existing =
    existingDatasets.find((dataset) => dataset.name === GOLDEN_SUITE_NAME) ?? existingDatasets[0];
  if (!existing) {
    const generated = await generateDeterministicBaselineSuite(db, AUTOMATIC_BASELINE_MAX_CASES);
    const [dataset] = await db
      .insert(aiEvaluationDatasets)
      .values({
        name: GOLDEN_SUITE_NAME,
        description: GOLDEN_SUITE_DESCRIPTION,
      })
      .returning();
    await insertBaselineCases(db, dataset.id, generated.cases);
    return formatDataset(dataset, {
      caseCount: generated.cases.length,
      baselineCaseCount: generated.cases.length,
      candidateCaseCount: 0,
      goldCaseCount: 0,
    });
  }

  const existingBaselineCases = await db
    .select({ expectedEvidence: aiEvaluationCases.expected_evidence })
    .from(aiEvaluationCases)
    .where(
      and(
        eq(aiEvaluationCases.dataset_id, existing.id),
        eq(aiEvaluationCases.lifecycle, "baseline"),
      ),
    );
  const baselineSourcesAvailable = await baselineSourcesAreAvailable(
    db,
    existingBaselineCases.map((evaluationCase) => evaluationCase.expectedEvidence),
  );
  const needsRefresh = shouldRefreshBaselineCases(existingBaselineCases.length, baselineSourcesAvailable);
  if (
    needsRefresh ||
    existing.name !== GOLDEN_SUITE_NAME ||
    existing.description !== GOLDEN_SUITE_DESCRIPTION
  ) {
    const generated = needsRefresh
      ? await generateDeterministicBaselineSuite(db, AUTOMATIC_BASELINE_MAX_CASES)
      : null;
    await db.transaction(async (transaction) => {
      if (needsRefresh) {
        await transaction
          .update(aiEvaluationCases)
          .set({ lifecycle: "retired", updated_at: new Date() })
          .where(
            and(
              eq(aiEvaluationCases.dataset_id, existing.id),
              eq(aiEvaluationCases.lifecycle, "baseline"),
            ),
          );
        await insertBaselineCases(transaction, existing.id, generated!.cases);
      }
      await transaction
        .update(aiEvaluationDatasets)
        .set({
          name: GOLDEN_SUITE_NAME,
          description: GOLDEN_SUITE_DESCRIPTION,
          version: needsRefresh ? sql`${aiEvaluationDatasets.version} + 1` : existing.version,
          updated_at: new Date(),
        })
        .where(eq(aiEvaluationDatasets.id, existing.id));
    });
  }
  return getAiEvaluationDataset(config, existing.id);
}

/**
 * A successful Ask/RAG save turns the owner-approved request into a local
 * regression probe. It reads only structural trace evidence; the approved
 * query comes from the request, never from trace retention.
 */
export async function addAiEvaluationRegressionCase(
  config: AppConfig,
  input: {
    traceId: string;
    redactedInput: string;
    feedbackSignal?: "helpful" | "incorrect" | "missing_source";
  },
) {
  const baseline = await ensureAiEvaluationBaseline(config, { maxCases: 6 });
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const trace = await getAiTrace(db, input.traceId);
  if (!trace || trace.operation !== "ask" || trace.status !== STATUS.SUCCEEDED) {
    throw new Error("Only a completed Ask/RAG response can become a regression case");
  }
  const selectedEvidence = selectedTraceEvidenceForRegression(trace.evidence ?? []);
  const expectsObservedEvidence = !input.feedbackSignal || input.feedbackSignal === "helpful";
  // A negative response identifies a case worth investigating, not the source
  // that should have been retrieved. Do not turn its observed evidence into
  // fabricated ground truth.
  const expectedEvidence = expectsObservedEvidence ? selectedEvidence : [];
  if (expectsObservedEvidence && !expectedEvidence.length) {
    throw new Error("The response has no selected vault evidence to evaluate");
  }

  const [existing] = await db
    .select({ id: aiEvaluationCases.id })
    .from(aiEvaluationCases)
    .where(eq(aiEvaluationCases.source_trace_id, input.traceId))
    .limit(1);
  if (existing) return getAiEvaluationDataset(config, baseline.id);

  const descriptor = regressionCaseDescriptor(input.feedbackSignal);

  await db.transaction(async (transaction) => {
    await transaction.insert(aiEvaluationCases).values({
      dataset_id: baseline.id,
      label: `${descriptor.label}: ${input.redactedInput.slice(0, 120)}`,
      redacted_input: input.redactedInput,
      expected_evidence: expectedEvidence,
      expected_outcome: descriptor.expectedOutcome,
      retrieved_evidence: [],
      retrieval_evidence_evaluated: false,
      lifecycle: "candidate",
      generation_metadata: {
        generator: input.feedbackSignal ? "owner_feedback" : "owner_approved_save",
        feedbackSignal: input.feedbackSignal ?? null,
        evaluationScope: "retrieval_citation",
        evidenceCount: expectedEvidence.length,
        observedEvidenceCount: selectedEvidence.length,
        groundTruth: expectsObservedEvidence ? "owner_validated_retrieval" : "not_yet_validated",
      },
      source_trace_id: input.traceId,
    });
    await transaction
      .update(aiEvaluationDatasets)
      .set({ version: sql`${aiEvaluationDatasets.version} + 1`, updated_at: new Date() })
      .where(eq(aiEvaluationDatasets.id, baseline.id));
  });
  return getAiEvaluationDataset(config, baseline.id);
}

/**
 * Stores a compact owner signal against a completed Ask trace. Negative signals
 * become a bounded regression probe only when the trace has selected vault
 * evidence. An explicit Helpful signal promotes only the retrieval/citation
 * expectation to gold; it never claims to validate answer correctness. The
 * feedback record intentionally stores no request or model content.
 */
export async function recordAiTraceFeedback(
  config: AppConfig,
  input: {
    traceId: string;
    signal: "helpful" | "incorrect" | "missing_source";
    redactedInput: string;
  },
) {
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const trace = await getAiTrace(db, input.traceId);
  if (!trace || trace.operation !== "ask" || trace.status !== STATUS.SUCCEEDED) {
    throw new Error("Feedback requires a completed Ask response");
  }

  await db
    .insert(aiTraceFeedback)
    .values({ trace_id: input.traceId, signal: input.signal })
    .returning({ id: aiTraceFeedback.id });

  let regressionCaseAdded = false;
  let goldCasePromoted = false;
  const hasSelectedEvidence = selectedTraceEvidenceForRegression(trace.evidence ?? []).length > 0;
  let [existingCase] = await db
    .select({
      id: aiEvaluationCases.id,
      datasetId: aiEvaluationCases.dataset_id,
      lifecycle: aiEvaluationCases.lifecycle,
    })
    .from(aiEvaluationCases)
    .where(eq(aiEvaluationCases.source_trace_id, input.traceId))
    .limit(1);

  if (!existingCase && (hasSelectedEvidence || shouldCreateRegressionFromFeedback(input.signal))) {
    await addAiEvaluationRegressionCase(config, {
      traceId: input.traceId,
      redactedInput: input.redactedInput,
      feedbackSignal: input.signal,
    });
    regressionCaseAdded = true;
    [existingCase] = await db
      .select({
        id: aiEvaluationCases.id,
        datasetId: aiEvaluationCases.dataset_id,
        lifecycle: aiEvaluationCases.lifecycle,
      })
      .from(aiEvaluationCases)
      .where(eq(aiEvaluationCases.source_trace_id, input.traceId))
      .limit(1);
  }

  if (existingCase && input.signal === "helpful" && existingCase.lifecycle !== "gold") {
    await updateEvaluationCaseLifecycle(db, existingCase, "gold");
    goldCasePromoted = true;
  }
  if (
    existingCase &&
    shouldCreateRegressionFromFeedback(input.signal) &&
    existingCase.lifecycle === "gold"
  ) {
    await updateEvaluationCaseLifecycle(db, existingCase, "candidate");
  }

  return {
    traceId: input.traceId,
    signal: input.signal,
    recorded: true,
    regressionCaseAdded,
    goldCasePromoted,
  };
}

/** Queues an application-owned evaluation run and returns immediately with observable progress. */
export async function runAiEvaluation(config: AppConfig, input: EvaluationInput) {
  const prepared = await prepareAiEvaluation(config, input);
  queueMicrotask(() => {
    void executeQueuedAiEvaluation(config, input, prepared).catch(async (error) => {
      const errorCode = "evaluation_worker_failed";
      await prepared.db
        .update(aiEvaluationRuns)
        .set({
          status: STATUS.FAILED,
          error_code: errorCode,
          summary: {
            caseCount: prepared.cases.length,
            completedCases: 0,
            failedCases: prepared.cases.length,
          },
          completed_at: new Date(),
          duration_ms: 0,
        })
        .where(eq(aiEvaluationRuns.id, prepared.run.id));
      console.error("[Evaluation] Background worker failed", error);
    });
  });
  return getAiEvaluationRunFromDb(prepared.db, prepared.run.id) as Promise<
    NonNullable<Awaited<ReturnType<typeof getAiEvaluationRunFromDb>>>
  >;
}

async function prepareAiEvaluation(
  config: AppConfig,
  input: EvaluationInput,
): Promise<PreparedEvaluation> {
  if (input.confirmTargetExecution !== true)
    throw new Error("Ask/RAG evaluation runs require explicit confirmation");
  if (input.judgeEnabled && !input.confirmLlmJudge)
    throw new Error("LLM judge runs require explicit confirmation");
  const judgeCapability = getSemanticJudgeCapability(config);
  const baseline = input.datasetId
    ? null
    : await ensureAiEvaluationBaseline(config, {
        maxCases: AUTOMATIC_BASELINE_MAX_CASES,
      });
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const datasetId = input.datasetId ?? baseline?.id;
  if (!datasetId) throw new Error("An evaluation dataset could not be prepared");
  const [dataset] = await db
    .select()
    .from(aiEvaluationDatasets)
    .where(eq(aiEvaluationDatasets.id, datasetId))
    .limit(1);
  if (!dataset) throw new Error("Evaluation dataset not found");
  const availableCases = await db
    .select()
    .from(aiEvaluationCases)
    // Candidates make regressions observable; gold is the narrow owner-validated retrieval gate.
    .where(
      and(
        eq(aiEvaluationCases.dataset_id, dataset.id),
        inArray(aiEvaluationCases.lifecycle, ["baseline", "candidate", "gold"]),
      ),
    )
    .orderBy(asc(aiEvaluationCases.created_at));
  if (!availableCases.length) throw new Error("Golden Suite v1 has no active cases to run");
  const cases = availableCases.slice(0, input.maxCases);
  const semanticGoldCaseCount = input.judgeEnabled
    ? cases.filter((evaluationCase) => evaluationCase.lifecycle === "gold").length
    : 0;
  const judgeEnabled = semanticGoldCaseCount > 0;
  if (judgeEnabled && !judgeCapability.semanticJudgeAvailable) {
    throw new Error("No permitted semantic evaluator is configured");
  }
  validateEvaluationBudget({
    caseCount: judgeEnabled ? semanticGoldCaseCount : cases.length,
    judgeEnabled,
    maxCases: input.maxCases,
    maxJudgeCalls: input.maxJudgeCalls,
    maxTotalTokens: input.maxTotalTokens,
  });

  const workflowManifest = {
    ...buildAskWorkflowManifest(config, input.topK),
    target: judgeEnabled ? "retrieval_structural_with_gold_judge" : "retrieval_structural",
  };
  const [run] = await db
    .insert(aiEvaluationRuns)
    .values({
      dataset_id: dataset.id,
      dataset_version: dataset.version,
      evaluator_contract_version: AI_EVALUATOR_CONTRACT_VERSION,
      rubric_version: input.rubricVersion,
      judge_enabled: judgeEnabled,
      model_provider: judgeEnabled ? judgeCapability.semanticJudgeProvider : null,
      model_name: judgeEnabled ? judgeCapability.semanticJudgeModel : null,
      max_cases: input.maxCases,
      max_judge_calls: input.maxJudgeCalls,
      max_total_tokens: input.maxTotalTokens,
      workflow_manifest: workflowManifest,
      status: STATUS.QUEUED,
      summary: {
        caseCount: cases.length,
        completedCases: 0,
        failedCases: 0,
        judgeCalls: 0,
        totalTokens: 0,
      },
    })
    .returning();
  return { db, dataset, cases, judgeCapability, judgeEnabled, semanticGoldCaseCount, run };
}

async function executeQueuedAiEvaluation(
  config: AppConfig,
  input: EvaluationInput,
  prepared: PreparedEvaluation,
) {
  const { db, cases, judgeCapability, judgeEnabled, semanticGoldCaseCount, run } = prepared;
  await db
    .update(aiEvaluationRuns)
    .set({ status: STATUS.RUNNING })
    .where(eq(aiEvaluationRuns.id, run.id));
  const startedAt = Date.now();
  const rootSpanId = await startSpan(db, run.id, "evaluation", {
    case_count: cases.length,
    judge_enabled: judgeEnabled,
    semantic_gold_case_count: semanticGoldCaseCount,
    judge_kind: judgeEnabled ? judgeCapability.semanticJudgeKind : null,
    judge_provider: judgeEnabled ? judgeCapability.semanticJudgeProvider : null,
    contract_version: AI_EVALUATOR_CONTRACT_VERSION,
  });
  let totalTokens = 0;
  let judgeCalls = 0;
  let cloudFallbacks = 0;
  let failedCases = 0;
  let semanticJudgeDisabled = false;
  for (const [caseIndex, evaluationCase] of cases.entries()) {
    const caseStartedAt = Date.now();
    const caseSpanId = await startSpan(
      db,
      run.id,
      "case",
      { case_number: caseIndex + 1 },
      rootSpanId,
    );
    let status: "succeeded" | "failed" = STATUS.SUCCEEDED;
    let deterministic: DeterministicEvaluation & {
      execution: Record<string, string | number | boolean | null>;
    } = failedExecutionDeterministic(evaluationCase);
    let executionTraceId: string | null = null;
    let judge: LocalJudgeResult | null = null;
    let executionSpanId: string | null = null;
    let targetExecutionSucceeded = false;
    let judgeAttempted = false;
    let targetPromptTokens: number | null = null;
    let targetCandidateTokens: number | null = null;
    let totalCaseTokens: number | null = null;
    let errorCode: string | null = null;
    try {
      // Only owner-validated gold cases execute a model and semantic judge.
      // Canaries and diagnostic candidates remain fast, deterministic checks.
      const executeFullTarget =
        judgeEnabled && evaluationCase.lifecycle === "gold" && !semanticJudgeDisabled;
      const executionStartedAt = Date.now();
      executionSpanId = await startSpan(
        db,
        run.id,
        "target_execution",
        {
          target: executeFullTarget ? "ask_rag" : "retrieval_structural",
          top_k: input.topK,
        },
        caseSpanId,
      );
      const execution = executeFullTarget
        ? await executeAskEvaluation(config, {
            redactedInput: evaluationCase.redacted_input,
            topK: input.topK,
          })
        : await executeRetrievalEvaluation(config, {
            redactedInput: evaluationCase.redacted_input,
            topK: input.topK,
          });
      executionTraceId = execution.traceId;
      targetPromptTokens = execution.trace.promptTokens;
      targetCandidateTokens = execution.trace.candidateTokens;
      totalCaseTokens = execution.trace.totalTokens;
      totalTokens += execution.trace.totalTokens ?? 0;
      deterministic = {
        ...evaluateDeterministicCase({
          id: evaluationCase.id,
          redactedInput: evaluationCase.redacted_input,
          expectedEvidence: evaluationCase.expected_evidence as Array<{
            documentPath: string;
            chunkIndex?: number;
          }>,
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

      if (executeFullTarget) {
        if (judgeCalls >= input.maxJudgeCalls || totalTokens >= input.maxTotalTokens) {
          throw new Error("judge_budget_exhausted");
        }
        const judgeStartedAt = Date.now();
        const judgeKind = judgeCapability.semanticJudgeKind;
        if (!judgeKind) throw new Error("semantic_judge_unavailable");
        const judgeSpanId = await startSpan(
          db,
          run.id,
          `${judgeKind}_judge`,
          {
            rubric_version: input.rubricVersion,
            max_output_tokens: 256,
            provider: judgeCapability.semanticJudgeProvider,
            model: judgeCapability.semanticJudgeModel,
          },
          caseSpanId,
        );
        judgeAttempted = true;
        const judgeInput = {
          redactedInput: evaluationCase.redacted_input,
          expectedOutcome: evaluationCase.expected_outcome,
          candidateOutput: execution.candidateOutput,
          evidence: execution.localJudgeEvidence,
        };
        try {
          const judgeResult =
            judgeKind === "cloud"
              ? await runCloudJudge(config, judgeInput)
              : await runLocalJudge(config, judgeInput);
          judge = judgeResult.result;
          judgeCalls += 1;
          totalCaseTokens = (totalCaseTokens ?? 0) + (judgeResult.totalTokens ?? 0);
          totalTokens += judgeResult.totalTokens ?? 0;
          await completeSpan(
            db,
            judgeSpanId,
            STATUS.SUCCEEDED,
            Date.now() - judgeStartedAt,
            judgeResult.totalTokens === null ? {} : { total_tokens: judgeResult.totalTokens },
          );
        } catch (error) {
          const errorCode = classifySemanticJudgeFailure(error, judgeKind);
          await completeSpan(
            db,
            judgeSpanId,
            STATUS.FAILED,
            Date.now() - judgeStartedAt,
            {},
            errorCode,
          );
          if (judgeKind !== "cloud" || !judgeCapability.localJudgeAvailable) {
            throw new Error(errorCode);
          }
          const fallbackStartedAt = Date.now();
          const fallbackSpanId = await startSpan(
            db,
            run.id,
            "local_judge_fallback",
            {
              rubric_version: input.rubricVersion,
              fallback_from: "cloud",
              failure_code: errorCode,
              model: judgeCapability.localJudgeModel,
            },
            caseSpanId,
          );
          try {
            const fallbackResult = await runLocalJudge(config, judgeInput);
            judge = {
              ...fallbackResult.result,
              labels: [...new Set([...fallbackResult.result.labels, "cloud_fallback_local"])],
            };
            judgeCalls += 1;
            cloudFallbacks += 1;
            totalCaseTokens = (totalCaseTokens ?? 0) + (fallbackResult.totalTokens ?? 0);
            totalTokens += fallbackResult.totalTokens ?? 0;
            await completeSpan(
              db,
              fallbackSpanId,
              STATUS.SUCCEEDED,
              Date.now() - fallbackStartedAt,
              fallbackResult.totalTokens === null
                ? {}
                : { total_tokens: fallbackResult.totalTokens },
            );
          } catch (fallbackError) {
            const fallbackErrorCode = classifySemanticJudgeFailure(fallbackError, "local");
            await completeSpan(
              db,
              fallbackSpanId,
              STATUS.FAILED,
              Date.now() - fallbackStartedAt,
              {},
              fallbackErrorCode,
            );
            throw new Error(fallbackErrorCode);
          }
        }
      }
      if (judge?.metrics) {
        deterministic = {
          ...deterministic,
          semantic: { engine: "promptfoo", metrics: judge.metrics },
        } as typeof deterministic;
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
      const classifiedError =
        error instanceof Error && error.message === "judge_budget_exhausted"
          ? "judge_budget_exhausted"
          : error instanceof Error &&
              (error.message === "local_judge_invalid_response" ||
                error.message === "local_judge_unavailable" ||
                error.message === "cloud_judge_invalid_response" ||
                error.message === "cloud_judge_unavailable")
            ? error.message
            : judgeAttempted
              ? judgeCapability.semanticJudgeKind === "cloud"
                ? "cloud_judge_unavailable"
                : "local_judge_unavailable"
              : "target_execution_failed";
      const semanticFailure = isOptionalSemanticJudgeFailure(classifiedError);
      if (targetExecutionSucceeded && semanticFailure) {
        // Semantic scoring is additive. A configured evaluator being offline
        // must not turn a valid deterministic retrieval check into a failure.
        errorCode = classifiedError;
        semanticJudgeDisabled = true;
      } else {
        status = STATUS.FAILED;
        errorCode = classifiedError;
        failedCases += 1;
      }
    }
    await db.insert(aiEvaluationResults).values({
      evaluation_run_id: run.id,
      evaluation_case_id: evaluationCase.id,
      status,
      deterministic,
      execution_trace_id: executionTraceId,
      judge_score: judge?.score ?? null,
      judge_labels: judge?.labels ?? [],
      prompt_tokens: targetPromptTokens,
      candidate_tokens: targetCandidateTokens,
      total_tokens: totalCaseTokens,
      error_code: errorCode,
    });
    await completeSpan(
      db,
      caseSpanId,
      status,
      Date.now() - caseStartedAt,
      { deterministic: true },
      errorCode ?? undefined,
    );
    await db
      .update(aiEvaluationRuns)
      .set({
        summary: {
          caseCount: cases.length,
          completedCases: caseIndex + 1,
          failedCases,
          judgeCalls,
          cloudFallbacks,
          totalTokens,
        },
      })
      .where(eq(aiEvaluationRuns.id, run.id));
  }
  const durationMs = Date.now() - startedAt;
  const runStatus = failedCases > 0 ? STATUS.FAILED : STATUS.SUCCEEDED;
  await completeSpan(
    db,
    rootSpanId,
    runStatus,
    durationMs,
    {
      judge_calls: judgeCalls,
      cloud_fallbacks: cloudFallbacks,
      total_tokens: totalTokens,
      failed_cases: failedCases,
    },
    runStatus === STATUS.FAILED ? "case_evaluation_failed" : undefined,
  );
  const [completed] = await db
    .update(aiEvaluationRuns)
    .set({
      status: runStatus,
      error_code: runStatus === STATUS.FAILED ? "case_evaluation_failed" : null,
      summary: {
        caseCount: cases.length,
        completedCases: cases.length,
        judgeCalls,
        cloudFallbacks,
        totalTokens,
        failedCases,
      },
      completed_at: new Date(),
      duration_ms: durationMs,
    })
    .where(eq(aiEvaluationRuns.id, run.id))
    .returning();
  return getAiEvaluationRunFromDb(db, completed.id) as Promise<
    NonNullable<Awaited<ReturnType<typeof getAiEvaluationRunFromDb>>>
  >;
}

export async function getAiEvaluationCapabilities(config: AppConfig) {
  return getSemanticJudgeRuntimeCapability(config);
}

/** A local process cannot safely resume a model call after restart; mark it clearly instead of leaving a ghost run. */
export async function markInterruptedAiEvaluationRuns(config: AppConfig) {
  const { db } = createDbClient(requiredDatabaseUrl(config));
  await db
    .update(aiEvaluationRuns)
    .set({
      status: STATUS.FAILED,
      error_code: "interrupted_by_restart",
      completed_at: new Date(),
    })
    .where(inArray(aiEvaluationRuns.status, [STATUS.QUEUED, STATUS.RUNNING]));
}

export async function listAiEvaluationRuns(config: AppConfig, datasetId?: string) {
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const runs = datasetId
    ? await db
        .select()
        .from(aiEvaluationRuns)
        .where(eq(aiEvaluationRuns.dataset_id, datasetId))
        .orderBy(desc(aiEvaluationRuns.started_at))
    : await db.select().from(aiEvaluationRuns).orderBy(desc(aiEvaluationRuns.started_at));
  const hydratedRuns = await Promise.all(runs.map((run) => getAiEvaluationRunFromDb(db, run.id)));
  return hydratedRuns.filter(isPresent);
}

export async function getAiEvaluationRun(config: AppConfig, runId: string) {
  const { db } = createDbClient(requiredDatabaseUrl(config));
  return getAiEvaluationRunFromDb(db, runId);
}

export async function compareAiEvaluationRuns(
  config: AppConfig,
  input: { baselineRunId: string; candidateRunId: string },
) {
  if (input.baselineRunId === input.candidateRunId)
    throw new Error("Select two distinct evaluation runs");
  const { db } = createDbClient(requiredDatabaseUrl(config));
  const [baseline, candidate] = await Promise.all([
    getAiEvaluationRunFromDb(db, input.baselineRunId),
    getAiEvaluationRunFromDb(db, input.candidateRunId),
  ]);
  if (!baseline || !candidate) throw new Error("Evaluation run not found");
  const comparison = compareEvaluationRuns(
    {
      id: baseline.id,
      results: baseline.results.map((result) => ({
        status: result.status,
        deterministic: result.deterministic as unknown as DeterministicEvaluation,
        judgeScore: result.judgeScore,
      })),
    },
    {
      id: candidate.id,
      results: candidate.results.map((result) => ({
        status: result.status,
        deterministic: result.deterministic as unknown as DeterministicEvaluation,
        judgeScore: result.judgeScore,
      })),
    },
  );
  return buildAiEvaluationComparison(baseline, candidate, comparison);
}

async function getAiEvaluationRunFromDb(
  db: ReturnType<typeof createDbClient>["db"],
  runId: string,
) {
  const [run] = await db
    .select()
    .from(aiEvaluationRuns)
    .where(eq(aiEvaluationRuns.id, runId))
    .limit(1);
  if (!run) return null;
  const [dataset] = await db
    .select()
    .from(aiEvaluationDatasets)
    .where(eq(aiEvaluationDatasets.id, run.dataset_id))
    .limit(1);
  const results = await db
    .select()
    .from(aiEvaluationResults)
    .where(eq(aiEvaluationResults.evaluation_run_id, run.id))
    .orderBy(asc(aiEvaluationResults.created_at));
  const spans = await db
    .select()
    .from(aiEvaluationSpans)
    .where(eq(aiEvaluationSpans.evaluation_run_id, run.id))
    .orderBy(asc(aiEvaluationSpans.started_at));
  return {
    id: run.id,
    datasetId: run.dataset_id,
    datasetName: dataset?.name ?? "Deleted dataset",
    datasetVersion: run.dataset_version,
    evaluatorContractVersion: run.evaluator_contract_version,
    rubricVersion: run.rubric_version,
    judgeEnabled: run.judge_enabled,
    modelProvider: run.model_provider,
    modelName: run.model_name,
    maxCases: run.max_cases,
    maxJudgeCalls: run.max_judge_calls,
    maxTotalTokens: run.max_total_tokens,
    workflowManifest: run.workflow_manifest as Record<string, unknown>,
    status: run.status as "queued" | "running" | "started" | "succeeded" | "failed",
    errorCode: run.error_code,
    summary: run.summary as Record<string, unknown>,
    startedAt: run.started_at.toISOString(),
    completedAt: run.completed_at?.toISOString() ?? null,
    durationMs: run.duration_ms,
    results: results.map((result) => ({
      id: result.id,
      caseId: result.evaluation_case_id,
      status: result.status as "succeeded" | "failed",
      deterministic: result.deterministic as Record<string, unknown>,
      executionTraceId: result.execution_trace_id,
      judgeScore: result.judge_score,
      judgeLabels: result.judge_labels as string[],
      promptTokens: result.prompt_tokens,
      candidateTokens: result.candidate_tokens,
      totalTokens: result.total_tokens,
      errorCode: result.error_code,
      createdAt: result.created_at.toISOString(),
    })),
    spans: spans.map((span) => ({
      id: span.id,
      parentSpanId: span.parent_span_id,
      spanType: span.span_type,
      status: span.status as "started" | "succeeded" | "failed",
      attributes: span.attributes as Record<string, string | number | boolean | null>,
      errorCode: span.error_code,
      startedAt: span.started_at.toISOString(),
      completedAt: span.completed_at?.toISOString() ?? null,
      durationMs: span.duration_ms,
    })),
  };
}

export function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

/** Converts structural selected evidence into bounded regression targets. */
export function selectedTraceEvidenceForRegression(
  evidence: Array<{ documentPath: string; chunkIndex: number; selectionRank: number | null }>,
) {
  return evidence
    .filter((item) => item.selectionRank !== null)
    .sort(
      (left, right) =>
        (left.selectionRank ?? Number.MAX_SAFE_INTEGER) -
        (right.selectionRank ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, 5)
    .map((item) => ({ documentPath: item.documentPath, chunkIndex: item.chunkIndex }));
}

export function shouldCreateRegressionFromFeedback(
  signal: "helpful" | "incorrect" | "missing_source",
) {
  return signal !== "helpful";
}

export function regressionCaseDescriptor(
  signal: "helpful" | "incorrect" | "missing_source" | undefined,
) {
  if (signal === "helpful") {
    return {
      label: "Owner-validated retrieval",
      expectedOutcome:
        "Retrieve the owner-validated evidence and provide a grounded answer with appropriate citations.",
    };
  }
  if (signal === "missing_source") {
    return {
      label: "Reported missing source",
      expectedOutcome: null,
    };
  }
  if (signal === "incorrect") {
    return {
      label: "Reported incorrect response",
      expectedOutcome: null,
    };
  }
  return {
    label: "Saved response",
    expectedOutcome:
      "Retrieve the owner-approved evidence and provide a grounded answer with appropriate citations.",
  };
}

export function isOptionalSemanticJudgeFailure(errorCode: string) {
  return (
    errorCode === "judge_budget_exhausted" ||
    errorCode === "local_judge_invalid_response" ||
    errorCode === "local_judge_unavailable" ||
    errorCode === "cloud_judge_invalid_response" ||
    errorCode === "cloud_judge_unavailable"
  );
}

function formatDataset(
  dataset: typeof aiEvaluationDatasets.$inferSelect,
  counts: {
    caseCount: number;
    baselineCaseCount: number;
    candidateCaseCount: number;
    goldCaseCount: number;
  },
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

function datasetCaseCounts(cases: Array<{ lifecycle: string }>) {
  const counts = { caseCount: 0, baselineCaseCount: 0, candidateCaseCount: 0, goldCaseCount: 0 };
  for (const evaluationCase of cases) {
    const lifecycle = normalizeEvaluationCaseLifecycle(evaluationCase.lifecycle);
    if (lifecycle === "retired") continue;
    counts.caseCount += 1;
    if (lifecycle === "baseline") counts.baselineCaseCount += 1;
    if (lifecycle === "candidate") counts.candidateCaseCount += 1;
    if (lifecycle === "gold") counts.goldCaseCount += 1;
  }
  return counts;
}

function normalizeEvaluationCaseLifecycle(value: string): EvaluationCaseLifecycle {
  return value === "candidate" || value === "gold" || value === "retired" ? value : "baseline";
}

function isLegacyGeneratedBaseline(name: string) {
  return (
    name === LEGACY_RETRIEVAL_CANARY_NAME ||
    name === LEGACY_GENERATED_BASELINE_NAME ||
    name === LEGACY_GENERATED_BASELINE_V1_NAME
  );
}

/** Refresh only when the current baseline can no longer be evaluated. */
export function shouldRefreshBaselineCases(currentCaseCount: number, sourcesAvailable: boolean) {
  return currentCaseCount === 0 || !sourcesAvailable;
}

type ExpectedEvidence = { documentPath: string; chunkIndex?: number };

async function baselineSourcesAreAvailable(
  db: ReturnType<typeof createDbClient>["db"],
  values: unknown[],
) {
  const expectedEvidence = values.flatMap(readExpectedEvidence);
  if (!expectedEvidence.length) return false;
  const paths = [...new Set(expectedEvidence.map((evidence) => evidence.documentPath))];
  const rows = await db
    .select({ documentPath: documents.path, chunkIndex: chunks.chunk_index })
    .from(chunks)
    .innerJoin(documents, eq(chunks.document_id, documents.id))
    .where(inArray(documents.path, paths));
  const indexed = new Set(rows.map((row) => evidenceKey(row.documentPath, row.chunkIndex)));
  return expectedEvidence.every(
    (evidence) =>
      evidence.chunkIndex === undefined || indexed.has(evidenceKey(evidence.documentPath, evidence.chunkIndex)),
  );
}

function readExpectedEvidence(value: unknown): ExpectedEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as { documentPath?: unknown; chunkIndex?: unknown };
    if (typeof candidate.documentPath !== "string" || !candidate.documentPath) return [];
    const chunkIndex = candidate.chunkIndex;
    if (chunkIndex !== undefined && (typeof chunkIndex !== "number" || !Number.isInteger(chunkIndex) || chunkIndex < 0))
      return [];
    return [{ documentPath: candidate.documentPath, chunkIndex }];
  });
}

function evidenceKey(documentPath: string, chunkIndex: number) {
  return `${documentPath}\u0000${String(chunkIndex)}`;
}

async function insertBaselineCases(
  db: { insert: ReturnType<typeof createDbClient>["db"]["insert"] },
  datasetId: string,
  cases: Awaited<ReturnType<typeof generateDeterministicBaselineSuite>>["cases"],
) {
  await db.insert(aiEvaluationCases).values(
    cases.map((candidate) => ({
      dataset_id: datasetId,
      label: `Retrieval baseline: ${candidate.label.replace(/^Indexed note: /, "")}`,
      redacted_input: candidate.redactedInput,
      expected_evidence: candidate.expectedEvidence,
      expected_outcome: candidate.expectedOutcome,
      retrieved_evidence: [],
      retrieval_evidence_evaluated: false,
      lifecycle: "baseline",
      generation_metadata: candidate.generationMetadata,
    })),
  );
}

async function updateEvaluationCaseLifecycle(
  db: ReturnType<typeof createDbClient>["db"],
  evaluationCase: { id: string; datasetId: string },
  lifecycle: "candidate" | "gold",
) {
  await db.transaction(async (transaction) => {
    await transaction
      .update(aiEvaluationCases)
      .set({ lifecycle, updated_at: new Date() })
      .where(eq(aiEvaluationCases.id, evaluationCase.id));
    await transaction
      .update(aiEvaluationDatasets)
      .set({ version: sql`${aiEvaluationDatasets.version} + 1`, updated_at: new Date() })
      .where(eq(aiEvaluationDatasets.id, evaluationCase.datasetId));
  });
}
function failedExecutionDeterministic(evaluationCase: typeof aiEvaluationCases.$inferSelect) {
  return {
    ...evaluateDeterministicCase({
      id: evaluationCase.id,
      redactedInput: evaluationCase.redacted_input,
      expectedEvidence: evaluationCase.expected_evidence as Array<{
        documentPath: string;
        chunkIndex?: number;
      }>,
      expectedOutcome: evaluationCase.expected_outcome,
      referenceAnswer: evaluationCase.reference_answer,
      retrievedEvidence: [],
      retrievalEvaluated: false,
    }),
    execution: {
      status: "failed",
      policy: "vault_hybrid",
      candidate_count: 0,
      selected_evidence_count: 0,
      context_character_count: 0,
      duration_ms: null,
      citation_count: 0,
    },
  };
}
function requiredDatabaseUrl(config: AppConfig) {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required for AI evaluation");
  return config.databaseUrl;
}
async function startSpan(
  db: ReturnType<typeof createDbClient>["db"],
  runId: string,
  spanType: string,
  attributes: Record<string, string | number | boolean | null>,
  parentSpanId?: string,
) {
  const [span] = await db
    .insert(aiEvaluationSpans)
    .values({
      evaluation_run_id: runId,
      parent_span_id: parentSpanId,
      span_type: spanType,
      status: STATUS.STARTED,
      attributes,
    })
    .returning({ id: aiEvaluationSpans.id });
  return span.id;
}
async function completeSpan(
  db: ReturnType<typeof createDbClient>["db"],
  spanId: string,
  status: "succeeded" | "failed",
  durationMs: number,
  attributes: Record<string, string | number | boolean | null>,
  errorCode?: string,
) {
  await db
    .update(aiEvaluationSpans)
    .set({
      status,
      duration_ms: durationMs,
      completed_at: new Date(),
      attributes,
      error_code: errorCode ?? null,
    })
    .where(eq(aiEvaluationSpans.id, spanId));
}
