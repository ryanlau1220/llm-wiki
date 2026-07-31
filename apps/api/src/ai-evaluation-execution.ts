import { fileURLToPath } from "node:url";

import { inArray } from "drizzle-orm";

import { createLLMProvider, isOllamaModelInstalled } from "@llm-wiki/ai";
import {
  getAiTrace,
  hybridRetrieve,
  packRetrievalContext,
  type AiTraceEvidence,
} from "@llm-wiki/core";
import { chunks, createDbClient } from "@llm-wiki/db";

import { askPreview } from "./ask";
import { createConfiguredEmbeddingProvider } from "./providers";

const EVALUATION_TARGET_MAX_OUTPUT_TOKENS = 384;
const EVALUATION_TARGET_TIMEOUT_MS = 90_000;
import type { AppConfig } from "./config";

const LOCAL_JUDGE_MAX_ANSWER_CHARACTERS = 6_000;
const LOCAL_JUDGE_MAX_EVIDENCE_CHARACTERS = 1_600;
const LOCAL_JUDGE_MAX_EVIDENCE_ITEMS = 5;
const LOCAL_JUDGE_MAX_OUTPUT_TOKENS = 256;
const PROMPTFOO_RUNNER_PATH = fileURLToPath(
  new URL("../../../packages/evaluation/src/promptfoo-runner.mjs", import.meta.url),
);
const PROMPTFOO_RESULT_PREFIX = "__LLM_WIKI_PROMPTFOO_RESULT__";

export type EvaluationEvidence = { documentPath: string; chunkIndex?: number };
export type LocalJudgeResult = {
  score: number;
  labels: string[];
  metrics?: Record<string, { score: number; passed: boolean }>;
};
export type LocalJudgeFailureCode = "local_judge_invalid_response" | "local_judge_unavailable";
export type CloudJudgeFailureCode = "cloud_judge_invalid_response" | "cloud_judge_unavailable";
export type SemanticJudgeFailureCode = LocalJudgeFailureCode | CloudJudgeFailureCode;
export type SemanticJudgeKind = "local" | "cloud";

type JudgeConfig = Partial<
  Pick<
    AppConfig,
    | "ollamaBaseUrl"
    | "ollamaEmbeddingModel"
    | "ollamaLlmModel"
    | "ollamaEvaluatorModel"
    | "evaluatorTimeoutMs"
    | "evaluatorMode"
    | "cloudEvaluatorProvider"
    | "cloudEvaluatorModel"
    | "allowCloudVaultEvaluation"
    | "gcpProjectId"
    | "gcpLocation"
    | "openaiApiKey"
    | "openaiBaseUrl"
  >
> & { geminiApiKey?: string };

export type AskEvaluationExecution = {
  traceId: string | null;
  candidateOutput: string;
  retrievedEvidence: EvaluationEvidence[];
  citedEvidence: EvaluationEvidence[];
  trace: {
    status: "succeeded" | "failed" | "started";
    policy: string;
    candidateCount: number;
    selectedEvidenceCount: number;
    contextCharacterCount: number;
    durationMs: number | null;
    citationCount: number;
    promptTokens: number | null;
    candidateTokens: number | null;
    totalTokens: number | null;
  };
  localJudgeEvidence: Array<{ documentPath: string; chunkIndex: number; text: string }>;
};

/**
 * Runs the production retrieval and packing path without a generation call.
 * This is the default repeatable check: it remains useful while a model
 * provider is rate-limited or offline. Semantic runs still exercise Ask/RAG.
 */
export async function executeRetrievalEvaluation(
  config: AppConfig,
  input: { redactedInput: string; topK: number },
): Promise<AskEvaluationExecution> {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required for evaluation execution");
  const startedAt = Date.now();
  const { db } = createDbClient(config.databaseUrl);
  const embeddingProvider = createConfiguredEmbeddingProvider(config);
  const retrieval = await hybridRetrieve(
    { db, embeddingProvider },
    {
      query: input.redactedInput,
      topK: input.topK,
    },
  );
  const contextPack = packRetrievalContext(retrieval.chunks);
  return {
    traceId: null,
    candidateOutput: "",
    retrievedEvidence: contextPack.chunks.map((chunk) => ({
      documentPath: chunk.documentPath,
      chunkIndex: chunk.chunkIndex,
    })),
    citedEvidence: [],
    trace: {
      status: "succeeded",
      policy: "vault_hybrid",
      candidateCount: retrieval.chunks.length,
      selectedEvidenceCount: contextPack.chunks.length,
      contextCharacterCount: contextPack.characterCount,
      durationMs: Date.now() - startedAt,
      citationCount: 0,
      promptTokens: null,
      candidateTokens: null,
      totalTokens: null,
    },
    localJudgeEvidence: [],
  };
}

/** Executes the production Ask/RAG target and returns only an in-memory evaluation packet. */
export async function executeAskEvaluation(
  config: AppConfig,
  input: { redactedInput: string; topK: number },
): Promise<AskEvaluationExecution> {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required for evaluation execution");

  const response = await askPreview(config, input.redactedInput, input.topK, "rag", {
    maxOutputTokens: EVALUATION_TARGET_MAX_OUTPUT_TOKENS,
    timeoutMs: EVALUATION_TARGET_TIMEOUT_MS,
  });
  if (typeof response.answer !== "string" || !response.retrieval) {
    throw new Error("Ask/RAG evaluation target returned an incomplete response");
  }
  const { db } = createDbClient(config.databaseUrl);
  const trace = response.traceId ? await getAiTrace(db, response.traceId) : null;
  const evidence = trace?.evidence ?? [];
  const modelUsage = getTraceModelUsage(trace?.spans ?? []);
  const citations = response.citations ?? [];
  const retrievedEvidence = evidence.map(toEvaluationEvidence);
  const citedEvidence = citations.map((citation) => ({
    documentPath: citation.path,
    chunkIndex: citation.chunkIndex,
  }));

  return {
    traceId: response.traceId,
    candidateOutput: response.answer,
    retrievedEvidence,
    citedEvidence,
    trace: {
      status: trace?.status ?? "failed",
      policy: trace?.policy ?? response.retrieval.policy,
      candidateCount: trace?.candidateCount ?? response.retrieval.chunkCount,
      selectedEvidenceCount: trace?.selectedEvidenceCount ?? evidence.length,
      contextCharacterCount: trace?.contextCharacterCount ?? 0,
      durationMs: trace?.durationMs ?? null,
      citationCount: citations.length,
      promptTokens: modelUsage.promptTokens,
      candidateTokens: modelUsage.candidateTokens,
      totalTokens: modelUsage.totalTokens,
    },
    localJudgeEvidence: await loadLocalJudgeEvidence(db, evidence),
  };
}

function getTraceModelUsage(
  spans: Array<{ spanType: string; attributes: Record<string, string | number | boolean | null> }>,
) {
  const modelSpan = spans.find((span) => span.spanType === "model");
  return {
    promptTokens: integerAttribute(modelSpan?.attributes.prompt_tokens),
    candidateTokens: integerAttribute(modelSpan?.attributes.candidate_tokens),
    totalTokens: integerAttribute(modelSpan?.attributes.total_tokens),
  };
}

function integerAttribute(value: string | number | boolean | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function getLocalJudgeCapability(
  config: Pick<AppConfig, "ollamaBaseUrl" | "ollamaLlmModel">,
) {
  const localJudgeAvailable = Boolean(config.ollamaBaseUrl || config.ollamaLlmModel);
  return {
    localJudgeAvailable,
    localJudgeModel: localJudgeAvailable ? (config.ollamaLlmModel ?? "llama3") : null,
  };
}

export function getSemanticJudgeCapability(config: JudgeConfig) {
  const localJudgeAvailable = Boolean(config.ollamaBaseUrl || config.ollamaLlmModel);
  const localJudgeModel = localJudgeAvailable
    ? (config.ollamaEvaluatorModel ?? config.ollamaLlmModel ?? "llama3")
    : null;
  const cloudJudgeAvailable = Boolean(
    config.allowCloudVaultEvaluation &&
      config.cloudEvaluatorProvider &&
      hasCloudProviderCredentials(config),
  );
  const cloudJudgeModel = cloudJudgeAvailable
    ? (config.cloudEvaluatorModel ?? defaultCloudModel(config.cloudEvaluatorProvider!))
    : null;
  const mode = config.evaluatorMode ?? "auto";
  const selected =
    mode === "cloud"
      ? cloudJudgeAvailable
        ? {
            kind: "cloud" as const,
            provider: config.cloudEvaluatorProvider!,
            model: cloudJudgeModel!,
          }
        : null
      : mode === "local"
        ? localJudgeAvailable
          ? { kind: "local" as const, provider: "ollama", model: localJudgeModel! }
          : null
        : cloudJudgeAvailable
          ? {
              kind: "cloud" as const,
              provider: config.cloudEvaluatorProvider!,
              model: cloudJudgeModel!,
            }
          : localJudgeAvailable
            ? { kind: "local" as const, provider: "ollama", model: localJudgeModel! }
            : null;

  return {
    localJudgeAvailable,
    localJudgeModel,
    cloudJudgeAvailable,
    cloudJudgeProvider: cloudJudgeAvailable ? config.cloudEvaluatorProvider! : null,
    cloudJudgeModel,
    cloudVaultSharingEnabled: Boolean(config.allowCloudVaultEvaluation),
    semanticJudgeAvailable: Boolean(selected),
    semanticJudgeKind: selected?.kind ?? null,
    semanticJudgeProvider: selected?.provider ?? null,
    semanticJudgeModel: selected?.model ?? null,
  };
}

/**
 * Configuration alone is not enough for local evaluation: Ollama may be
 * running without the requested model. Probe only its model inventory, with a
 * short timeout and without sending any vault-derived content.
 */
export async function getSemanticJudgeRuntimeCapability(config: JudgeConfig) {
  const capability = getSemanticJudgeCapability(config);
  if (capability.semanticJudgeKind !== "local" || !capability.localJudgeModel) return capability;
  try {
    const baseUrl = (config.ollamaBaseUrl ?? "http://localhost:11434").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(1_000) });
    if (!response.ok) throw new Error("Ollama model list unavailable");
    const payload = (await response.json()) as {
      models?: Array<{ name?: string; model?: string }>;
    };
    const installedModels = (payload.models ?? [])
      .flatMap((model) => [model.name, model.model])
      .filter((model): model is string => Boolean(model));
    if (isOllamaModelInstalled(capability.localJudgeModel, installedModels)) return capability;
  } catch {
    // The UI must degrade to structural evaluation when Ollama is unavailable.
  }
  return {
    ...capability,
    localJudgeAvailable: false,
    localJudgeModel: null,
    semanticJudgeAvailable: false,
    semanticJudgeKind: null,
    semanticJudgeProvider: null,
    semanticJudgeModel: null,
  };
}

function hasCloudProviderCredentials(config: JudgeConfig): boolean {
  switch (config.cloudEvaluatorProvider) {
    case "gemini":
      return Boolean(config.geminiApiKey);
    case "gemini-geap":
      return Boolean(config.gcpProjectId);
    case "openai":
      return Boolean(config.openaiApiKey);
    default:
      return false;
  }
}

function defaultCloudModel(provider: NonNullable<AppConfig["cloudEvaluatorProvider"]>): string {
  if (provider === "openai") return "gpt-4o-mini";
  return "gemini-2.5-flash";
}

/** Never falls back: vault-derived output is evaluated only by an explicitly configured local Ollama model. */
export async function runLocalJudge(
  config: JudgeConfig,
  input: {
    redactedInput: string;
    expectedOutcome: string | null;
    candidateOutput: string;
    evidence: Array<{ documentPath: string; chunkIndex: number; text: string }>;
  },
): Promise<{ result: LocalJudgeResult; totalTokens: number | null }> {
  if (!getLocalJudgeCapability(config).localJudgeAvailable) {
    throw new Error("A configured local Ollama model is required for semantic evaluation");
  }

  return runPromptfooLocalJudge(config, input);
}

/**
 * Promptfoo is Node-oriented and cannot safely run inside Bun. Keep that
 * boundary explicit: this Bun API process invokes one local Node worker and
 * receives only compact numeric scores back.
 */
async function runPromptfooLocalJudge(
  config: JudgeConfig,
  input: {
    redactedInput: string;
    expectedOutcome: string | null;
    candidateOutput: string;
    evidence: Array<{ documentPath: string; chunkIndex: number; text: string }>;
  },
): Promise<{ result: LocalJudgeResult; totalTokens: number | null }> {
  const child = Bun.spawn(["node", PROMPTFOO_RUNNER_PATH], {
    stdin: new TextEncoder().encode(
      JSON.stringify({
        baseUrl: config.ollamaBaseUrl,
        model: config.ollamaEvaluatorModel ?? config.ollamaLlmModel,
        embeddingModel: config.ollamaEmbeddingModel,
        timeoutMs: config.evaluatorTimeoutMs,
        cases: [
          {
            id: "case",
            query: input.redactedInput,
            answer: input.candidateOutput.slice(0, LOCAL_JUDGE_MAX_ANSWER_CHARACTERS),
            context: input.evidence
              .slice(0, LOCAL_JUDGE_MAX_EVIDENCE_ITEMS)
              .map((item) => item.text.slice(0, LOCAL_JUDGE_MAX_EVIDENCE_CHARACTERS)),
            expectedOutcome: input.expectedOutcome,
          },
        ],
      }),
    ),
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      OLLAMA_BASE_URL:
        config.ollamaBaseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
      PROMPTFOO_DISABLE_TELEMETRY: "true",
      EVALUATOR_TIMEOUT_MS: String(config.evaluatorTimeoutMs ?? 30_000),
    },
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0)
    throw new Error(
      stderr.includes("ollama_")
        ? "Local evaluator unavailable"
        : "Local evaluator returned invalid JSON",
    );
  const payload = stdout
    .slice(stdout.lastIndexOf(PROMPTFOO_RESULT_PREFIX) + PROMPTFOO_RESULT_PREFIX.length)
    .trim();
  return parsePromptfooLocalJudgeResult(payload);
}

export function parsePromptfooLocalJudgeResult(text: string): {
  result: LocalJudgeResult;
  totalTokens: number | null;
} {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Local evaluator returned invalid JSON");
  }
  const candidate = value as { totalTokens?: unknown; cases?: Array<{ metrics?: unknown }> };
  const metrics = candidate?.cases?.[0]?.metrics;
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics))
    throw new Error("Local evaluator result must be an object");
  const parsedMetrics = Object.fromEntries(
    Object.entries(metrics).flatMap(([name, metric]) => {
      if (!metric || typeof metric !== "object" || Array.isArray(metric)) return [];
      const error = (metric as { error?: unknown }).error;
      if (typeof error === "string" && error) return [];
      const score = (metric as { score?: unknown }).score;
      const passed = (metric as { passed?: unknown }).passed;
      return typeof score === "number" &&
        Number.isFinite(score) &&
        score >= 0 &&
        score <= 1 &&
        typeof passed === "boolean"
        ? [[name, { score, passed }]]
        : [];
    }),
  );
  const metricValues = Object.values(parsedMetrics);
  if (!metricValues.length) throw new Error("Ollama evaluator did not produce metric scores");
  const score =
    metricValues.reduce((total, metric) => total + metric.score, 0) / metricValues.length;
  return {
    result: {
      score,
      labels: Object.entries(parsedMetrics)
        .filter(([, metric]) => metric.passed)
        .map(([name]) => `promptfoo_${name.replaceAll("-", "_")}`),
      metrics: parsedMetrics,
    },
    totalTokens:
      typeof candidate.totalTokens === "number" && Number.isFinite(candidate.totalTokens)
        ? candidate.totalTokens
        : null,
  };
}

/** Cloud evaluation is possible only after the process-wide vault-sharing opt-in is enabled. */
export async function runCloudJudge(
  config: JudgeConfig,
  input: {
    redactedInput: string;
    expectedOutcome: string | null;
    candidateOutput: string;
    evidence: Array<{ documentPath: string; chunkIndex: number; text: string }>;
  },
): Promise<{ result: LocalJudgeResult; totalTokens: number | null }> {
  const capability = getSemanticJudgeCapability(config);
  if (!capability.cloudJudgeAvailable || !config.cloudEvaluatorProvider) {
    throw new Error(
      "A configured cloud evaluator with vault-sharing approval is required for cloud semantic evaluation",
    );
  }
  const provider = createLLMProvider({
    provider: config.cloudEvaluatorProvider,
    geminiApiKey: config.geminiApiKey,
    geminiGeap: {
      projectId: config.gcpProjectId,
      location: config.gcpLocation,
      model: config.cloudEvaluatorModel,
    },
    openai: {
      apiKey: config.openaiApiKey,
      baseUrl: config.openaiBaseUrl,
      model: config.cloudEvaluatorModel,
    },
    model: config.cloudEvaluatorModel,
  });
  const response = await provider.generate({
    prompt: buildSemanticJudgePrompt(input),
    systemInstruction:
      "You are an evaluation component. Return only JSON. Do not quote, summarize, or retain source material. Do not provide chain-of-thought.",
    responseMimeType: "application/json",
    temperature: 0,
    maxOutputTokens: LOCAL_JUDGE_MAX_OUTPUT_TOKENS,
  });
  return {
    result: parseLocalJudgeResult(response.text),
    totalTokens: response.usage?.totalTokens ?? null,
  };
}

export function parseLocalJudgeResult(text: string): LocalJudgeResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Local evaluator returned invalid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Local evaluator result must be an object");
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.score !== "number" ||
    !Number.isFinite(candidate.score) ||
    candidate.score < 0 ||
    candidate.score > 1
  ) {
    throw new Error("Local evaluator score must be a number from 0 to 1");
  }
  if (
    !Array.isArray(candidate.labels) ||
    candidate.labels.length > 5 ||
    candidate.labels.some((label) => typeof label !== "string" || !/^[a-z_]{1,40}$/.test(label))
  ) {
    throw new Error("Local evaluator labels must be compact identifiers");
  }
  return { score: candidate.score, labels: [...new Set(candidate.labels)] };
}

export function classifyLocalJudgeFailure(error: unknown): LocalJudgeFailureCode {
  if (error instanceof Error && error.message.startsWith("Local evaluator")) {
    return "local_judge_invalid_response";
  }
  return "local_judge_unavailable";
}

export function classifySemanticJudgeFailure(
  error: unknown,
  kind: SemanticJudgeKind,
): SemanticJudgeFailureCode {
  if (kind === "local") return classifyLocalJudgeFailure(error);
  if (error instanceof Error && error.message.startsWith("Local evaluator"))
    return "cloud_judge_invalid_response";
  return "cloud_judge_unavailable";
}

export function buildLocalJudgePrompt(input: {
  redactedInput: string;
  expectedOutcome: string | null;
  candidateOutput: string;
  evidence: Array<{ documentPath: string; chunkIndex: number; text: string }>;
}): string {
  return buildSemanticJudgePrompt(input);
}

export function buildSemanticJudgePrompt(input: {
  redactedInput: string;
  expectedOutcome: string | null;
  candidateOutput: string;
  evidence: Array<{ documentPath: string; chunkIndex: number; text: string }>;
}): string {
  return JSON.stringify({
    task: "Evaluate whether the answer addresses the request and is supported by selected local evidence.",
    output: {
      score: "number from 0 to 1",
      labels: ["supported", "unsupported", "incomplete", "off_topic", "abstained_appropriately"],
    },
    request: input.redactedInput,
    expectedOutcome: input.expectedOutcome,
    answer: input.candidateOutput.slice(0, LOCAL_JUDGE_MAX_ANSWER_CHARACTERS),
    selectedEvidence: input.evidence.slice(0, LOCAL_JUDGE_MAX_EVIDENCE_ITEMS).map((item) => ({
      path: item.documentPath,
      chunkIndex: item.chunkIndex,
      text: item.text.slice(0, LOCAL_JUDGE_MAX_EVIDENCE_CHARACTERS),
    })),
  });
}

function toEvaluationEvidence(evidence: AiTraceEvidence): EvaluationEvidence {
  return { documentPath: evidence.documentPath, chunkIndex: evidence.chunkIndex };
}

async function loadLocalJudgeEvidence(
  db: ReturnType<typeof createDbClient>["db"],
  evidence: AiTraceEvidence[],
): Promise<Array<{ documentPath: string; chunkIndex: number; text: string }>> {
  const documentIds = [...new Set(evidence.map((item) => item.documentId))];
  if (!documentIds.length) return [];
  const selectedChunks = await db
    .select({ documentId: chunks.document_id, chunkIndex: chunks.chunk_index, text: chunks.text })
    .from(chunks)
    .where(inArray(chunks.document_id, documentIds));
  const textByKey = new Map(
    selectedChunks.map((chunk) => [`${chunk.documentId}:${chunk.chunkIndex}`, chunk.text]),
  );
  return evidence
    .map((item) => ({
      documentPath: item.documentPath,
      chunkIndex: item.chunkIndex,
      text: textByKey.get(`${item.documentId}:${item.chunkIndex}`),
    }))
    .filter((item): item is { documentPath: string; chunkIndex: number; text: string } =>
      Boolean(item.text),
    );
}
