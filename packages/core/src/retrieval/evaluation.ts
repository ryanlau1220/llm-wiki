const DEFAULT_EVALUATION_K = 5;

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
