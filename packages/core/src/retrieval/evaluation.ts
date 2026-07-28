const DEFAULT_EVALUATION_K = 5;

export const AI_EVALUATOR_CONTRACT_VERSION = "ai-generator-evaluator-v1";
export const AI_EVALUATOR_RUBRIC_VERSION = "groundedness-v1";
export const AI_EVALUATION_LIMITS = {
  MAX_CASES: 100,
  MAX_JUDGE_CALLS: 100,
  MAX_TOTAL_TOKENS: 100_000,
  MAX_RATIONALE_LENGTH: 1_000,
} as const;

export type EvaluationEvidence = { documentPath: string; chunkIndex?: number };

/** Approved, redacted case material. It never originates from a stored trace payload. */
export type AiEvaluationCaseInput = {
  id: string;
  redactedInput: string;
  expectedEvidence: EvaluationEvidence[];
  expectedOutcome?: string | null;
  referenceAnswer?: string | null;
  candidateOutput?: string | null;
  retrievedEvidence?: EvaluationEvidence[];
  /** True only when retrieved evidence was actually captured for this evaluation case. */
  retrievalEvaluated?: boolean;
  citedEvidence?: EvaluationEvidence[];
};

export type DeterministicEvaluation = {
  citationSourceValidity: { passed: boolean; expectedCount: number; retrievedCount: number; invalidCount: number };
  citationCoverage: { citedCount: number; selectedCount: number; validCount: number };
  retrieval: { recallAtK: number; reciprocalRank: number; ndcgAtK: number } | null;
  groundedAbstention: { expected: boolean; observed: boolean; passed: boolean } | null;
  toolPolicy: { expected: "required" | "forbidden" | null; observed: "used" | "not_used" | "unknown"; passed: boolean | null };
};

export type JudgeEvaluation = { score: number; rationale: string };

export type EvaluationRunComparison = {
  baselineRunId: string;
  candidateRunId: string;
  retrievalRecallDelta: number | null;
  judgeScoreDelta: number | null;
  failedCaseDelta: number;
};

/** Compare versioned, structured results without inspecting any case payload. */
export function compareEvaluationRuns(
  baseline: { id: string; results: Array<{ status: "succeeded" | "failed"; deterministic: DeterministicEvaluation; judgeScore?: number | null }> },
  candidate: { id: string; results: Array<{ status: "succeeded" | "failed"; deterministic: DeterministicEvaluation; judgeScore?: number | null }> },
): EvaluationRunComparison {
  const candidateRecall = averageOptional(candidate.results.map((result) => result.deterministic.retrieval?.recallAtK));
  const baselineRecall = averageOptional(baseline.results.map((result) => result.deterministic.retrieval?.recallAtK));
  const candidateJudge = averageOptional(candidate.results.map((result) => result.judgeScore));
  const baselineJudge = averageOptional(baseline.results.map((result) => result.judgeScore));
  return {
    baselineRunId: baseline.id,
    candidateRunId: candidate.id,
    retrievalRecallDelta: candidateRecall === null || baselineRecall === null ? null : candidateRecall - baselineRecall,
    judgeScoreDelta: candidateJudge === null || baselineJudge === null ? null : candidateJudge - baselineJudge,
    failedCaseDelta: candidate.results.filter((result) => result.status === "failed").length - baseline.results.filter((result) => result.status === "failed").length,
  };
}

export function evaluateDeterministicCase(input: AiEvaluationCaseInput, k = DEFAULT_EVALUATION_K): DeterministicEvaluation {
  validateAiEvaluationCase(input);
  const retrieved = input.retrievedEvidence ?? [];
  const expected = input.expectedEvidence;
  const invalidCount = retrieved.filter((item) => !isEvidence(item)).length;
  const cited = input.citedEvidence ?? [];
  const selectedKeys = new Set(retrieved.filter(isEvidence).map(evidenceKey));
  const validCitationCount = cited.filter((item) => isEvidence(item) && selectedKeys.has(evidenceKey(item))).length;
  const retrievalEvaluated = input.retrievalEvaluated ?? input.retrievedEvidence !== undefined;
  const retrieval = retrievalEvaluated && expected.length > 0
    ? evaluateRetrieval([{ id: input.id, query: input.redactedInput, relevant: expected }], new Map([[input.id, retrieved.filter(isEvidence).map((item) => ({ documentPath: item.documentPath, chunkIndex: item.chunkIndex ?? 0 }))]]), k).cases[0]
    : null;
  const expectedAbstention = /\b(abstain|unknown|insufficient|cannot answer|not enough)\b/i.test(input.expectedOutcome ?? "");
  const observedAbstention = /\b(i (?:do not|don't) know|cannot answer|not enough (?:information|evidence)|insufficient (?:information|evidence))\b/i.test(input.candidateOutput ?? "");
  const toolExpected = /\b(tool|web search)\s*(?:is )?(required|must use)\b/i.test(input.expectedOutcome ?? "")
    ? "required" as const
    : /\b(tool|web search)\s*(?:is )?(forbidden|must not use|do not use)\b/i.test(input.expectedOutcome ?? "")
      ? "forbidden" as const : null;
  const toolObserved = /\b(tool|web search)\b/i.test(input.candidateOutput ?? "") ? "used" as const : "unknown" as const;
  return {
    citationSourceValidity: { passed: invalidCount === 0 && validCitationCount === cited.length, expectedCount: expected.length, retrievedCount: retrieved.length, invalidCount },
    citationCoverage: { citedCount: cited.length, selectedCount: retrieved.length, validCount: validCitationCount },
    retrieval: retrieval ? { recallAtK: retrieval.recallAtK, reciprocalRank: retrieval.reciprocalRank, ndcgAtK: retrieval.ndcgAtK } : null,
    groundedAbstention: input.expectedOutcome ? { expected: expectedAbstention, observed: observedAbstention, passed: expectedAbstention === observedAbstention } : null,
    toolPolicy: { expected: toolExpected, observed: toolObserved, passed: toolExpected === null || toolObserved === "unknown" ? null : (toolExpected === "required") === (toolObserved === "used") },
  };
}

/** Parse only a compact, structured judge result. Never request or retain CoT. */
export function parseJudgeEvaluation(text: string): JudgeEvaluation {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("Evaluator judge returned invalid JSON"); }
  if (!value || typeof value !== "object") throw new Error("Evaluator judge result must be an object");
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.score !== "number" || !Number.isFinite(candidate.score) || candidate.score < 0 || candidate.score > 1) throw new Error("Evaluator judge score must be a number from 0 to 1");
  if (typeof candidate.rationale !== "string" || !candidate.rationale.trim() || candidate.rationale.length > AI_EVALUATION_LIMITS.MAX_RATIONALE_LENGTH) throw new Error("Evaluator judge rationale must be a short explanation");
  return { score: candidate.score, rationale: candidate.rationale.trim() };
}

export function validateAiEvaluationCase(input: AiEvaluationCaseInput): void {
  if (!input.id.trim()) throw new Error("Evaluation case ID is required");
  if (!input.redactedInput.trim()) throw new Error("A user-approved redacted evaluation input is required");
  if (!Array.isArray(input.expectedEvidence)) throw new Error("Expected evaluation evidence must be an array");
  for (const evidence of [...input.expectedEvidence, ...(input.retrievedEvidence ?? [])]) {
    if (!isEvidence(evidence)) throw new Error("Evaluation evidence must have a document path and optional non-negative chunk index");
  }
}

export function validateEvaluationBudget(input: { caseCount: number; judgeEnabled: boolean; maxCases: number; maxJudgeCalls: number; maxTotalTokens: number }): void {
  if (!Number.isInteger(input.caseCount) || input.caseCount < 1 || input.caseCount > input.maxCases || input.maxCases > AI_EVALUATION_LIMITS.MAX_CASES) throw new Error("Evaluation case budget exceeded");
  if (!Number.isInteger(input.maxJudgeCalls) || input.maxJudgeCalls < 0 || input.maxJudgeCalls > AI_EVALUATION_LIMITS.MAX_JUDGE_CALLS) throw new Error("Evaluation judge-call budget is invalid");
  if (input.judgeEnabled && input.maxJudgeCalls < input.caseCount) throw new Error("Evaluation judge-call budget must cover every case");
  if (!Number.isInteger(input.maxTotalTokens) || input.maxTotalTokens < 1 || input.maxTotalTokens > AI_EVALUATION_LIMITS.MAX_TOTAL_TOKENS) throw new Error("Evaluation token budget is invalid");
}

function isEvidence(value: unknown): value is EvaluationEvidence {
  if (!value || typeof value !== "object") return false;
  const evidence = value as EvaluationEvidence;
  return typeof evidence.documentPath === "string" && evidence.documentPath.trim().length > 0
    && (evidence.chunkIndex === undefined || (Number.isInteger(evidence.chunkIndex) && evidence.chunkIndex >= 0));
}

function evidenceKey(value: EvaluationEvidence): string {
  return `${value.documentPath}:${value.chunkIndex ?? "document"}`;
}

export type RetrievalEvaluationTarget = {
  documentPath: string;
  chunkIndex?: number;
  relevance?: number;
};

export type RetrievalEvaluationCase = {
  id: string;
  query: string;
  relevant: RetrievalEvaluationTarget[];
};

export type RetrievedEvaluationItem = {
  documentPath: string;
  chunkIndex: number;
};

export type RetrievalEvaluationCaseMetrics = {
  id: string;
  recallAtK: number;
  reciprocalRank: number;
  ndcgAtK: number;
};

export type RetrievalEvaluationMetrics = {
  evaluatedCaseCount: number;
  k: number;
  recallAtK: number;
  meanReciprocalRank: number;
  ndcgAtK: number;
  cases: RetrievalEvaluationCaseMetrics[];
};

export function evaluateRetrieval(
  cases: RetrievalEvaluationCase[],
  retrievedByCase: Map<string, RetrievedEvaluationItem[]>,
  k = DEFAULT_EVALUATION_K,
): RetrievalEvaluationMetrics {
  validateEvaluationCases(cases, k);

  const caseMetrics = cases.map((evaluationCase) => {
    const retrieved = retrievedByCase.get(evaluationCase.id) ?? [];
    return evaluateCase(evaluationCase, retrieved, k);
  });
  const evaluatedCaseCount = caseMetrics.length;

  return {
    evaluatedCaseCount,
    k,
    recallAtK: average(caseMetrics.map((metrics) => metrics.recallAtK)),
    meanReciprocalRank: average(caseMetrics.map((metrics) => metrics.reciprocalRank)),
    ndcgAtK: average(caseMetrics.map((metrics) => metrics.ndcgAtK)),
    cases: caseMetrics,
  };
}

function evaluateCase(
  evaluationCase: RetrievalEvaluationCase,
  retrieved: RetrievedEvaluationItem[],
  k: number,
): RetrievalEvaluationCaseMetrics {
  const rankedItems = retrieved.slice(0, k);
  const matchedTargets = new Set<string>();
  let reciprocalRank = 0;
  const gainedRelevance: number[] = [];

  for (const [index, item] of rankedItems.entries()) {
    const target = findMatchingTarget(item, evaluationCase.relevant);
    const relevance = target ? target.relevance ?? 1 : 0;
    gainedRelevance.push(relevance);

    if (target) {
      matchedTargets.add(targetKey(target));
      if (reciprocalRank === 0) reciprocalRank = 1 / (index + 1);
    }
  }

  const idealRelevance = evaluationCase.relevant
    .map((target) => target.relevance ?? 1)
    .sort((left, right) => right - left)
    .slice(0, k);
  const idealDcg = discountedCumulativeGain(idealRelevance);

  return {
    id: evaluationCase.id,
    recallAtK: matchedTargets.size / evaluationCase.relevant.length,
    reciprocalRank,
    ndcgAtK: idealDcg === 0 ? 0 : discountedCumulativeGain(gainedRelevance) / idealDcg,
  };
}

function validateEvaluationCases(cases: RetrievalEvaluationCase[], k: number): void {
  if (!Number.isInteger(k) || k < 1) throw new Error("Evaluation K must be a positive integer");
  if (!cases.length) throw new Error("At least one retrieval evaluation case is required");

  const caseIds = new Set<string>();
  for (const evaluationCase of cases) {
    if (!evaluationCase.id.trim()) throw new Error("Retrieval evaluation case ID is required");
    if (caseIds.has(evaluationCase.id)) {
      throw new Error(`Duplicate retrieval evaluation case ID: ${evaluationCase.id}`);
    }
    caseIds.add(evaluationCase.id);

    if (!evaluationCase.query.trim()) {
      throw new Error(`Retrieval evaluation query is required for: ${evaluationCase.id}`);
    }
    if (!evaluationCase.relevant.length) {
      throw new Error(`Relevant targets are required for: ${evaluationCase.id}`);
    }

    const targets = new Set<string>();
    for (const target of evaluationCase.relevant) {
      if (!target.documentPath.trim()) {
        throw new Error(`Relevant document path is required for: ${evaluationCase.id}`);
      }
      if (target.chunkIndex !== undefined && (!Number.isInteger(target.chunkIndex) || target.chunkIndex < 0)) {
        throw new Error(`Relevant chunk index must be a non-negative integer for: ${evaluationCase.id}`);
      }
      if (target.relevance !== undefined && (!Number.isFinite(target.relevance) || target.relevance <= 0)) {
        throw new Error(`Relevant score must be positive for: ${evaluationCase.id}`);
      }

      const key = targetKey(target);
      if (targets.has(key)) throw new Error(`Duplicate relevant target for: ${evaluationCase.id}`);
      targets.add(key);
    }
  }
}

function findMatchingTarget(
  item: RetrievedEvaluationItem,
  targets: RetrievalEvaluationTarget[],
): RetrievalEvaluationTarget | undefined {
  return targets.find((target) => (
    target.documentPath === item.documentPath
    && (target.chunkIndex === undefined || target.chunkIndex === item.chunkIndex)
  ));
}

function targetKey(target: RetrievalEvaluationTarget): string {
  return `${target.documentPath}:${target.chunkIndex ?? "document"}`;
}

function discountedCumulativeGain(relevances: number[]): number {
  return relevances.reduce(
    (total, relevance, index) => total + ((2 ** relevance - 1) / Math.log2(index + 2)),
    0,
  );
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function averageOptional(values: Array<number | null | undefined>): number | null {
  const present = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return present.length ? average(present) : null;
}
