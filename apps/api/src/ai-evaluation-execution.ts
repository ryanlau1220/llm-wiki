import { inArray } from "drizzle-orm";

import { createLLMProvider } from "@llm-wiki/ai";
import { getAiTrace, type AiTraceEvidence } from "@llm-wiki/core";
import { chunks, createDbClient } from "@llm-wiki/db";

import { askPreview } from "./ask";
import type { AppConfig } from "./config";

const LOCAL_JUDGE_MAX_ANSWER_CHARACTERS = 6_000;
const LOCAL_JUDGE_MAX_EVIDENCE_CHARACTERS = 1_600;
const LOCAL_JUDGE_MAX_EVIDENCE_ITEMS = 5;
const LOCAL_JUDGE_MAX_OUTPUT_TOKENS = 256;

export type EvaluationEvidence = { documentPath: string; chunkIndex?: number };
export type LocalJudgeResult = { score: number; labels: string[] };
export type LocalJudgeFailureCode = "local_judge_invalid_response" | "local_judge_unavailable";

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

/** Executes the production Ask/RAG target and returns only an in-memory evaluation packet. */
export async function executeAskEvaluation(
  config: AppConfig,
  input: { redactedInput: string; topK: number },
): Promise<AskEvaluationExecution> {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required for evaluation execution");

  const response = await askPreview(config, input.redactedInput, input.topK, "rag");
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

export function getLocalJudgeCapability(config: Pick<AppConfig, "ollamaBaseUrl" | "ollamaLlmModel">) {
  const localJudgeAvailable = Boolean(config.ollamaBaseUrl || config.ollamaLlmModel);
  return {
    localJudgeAvailable,
    localJudgeModel: localJudgeAvailable ? config.ollamaLlmModel ?? "llama3" : null,
  };
}

/** Never falls back: vault-derived output is evaluated only by an explicitly configured local Ollama model. */
export async function runLocalJudge(
  config: AppConfig,
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

  const provider = createLLMProvider({
    provider: "ollama",
    ollama: { baseUrl: config.ollamaBaseUrl, model: config.ollamaLlmModel },
  });
  const response = await provider.generate({
    prompt: buildLocalJudgePrompt(input),
    systemInstruction: "You are a local evaluation component. Return only JSON. Do not quote, summarize, or retain source material. Do not provide chain-of-thought.",
    responseMimeType: "application/json",
    temperature: 0,
    maxOutputTokens: LOCAL_JUDGE_MAX_OUTPUT_TOKENS,
  });
  return { result: parseLocalJudgeResult(response.text), totalTokens: response.usage?.totalTokens ?? null };
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
  if (typeof candidate.score !== "number" || !Number.isFinite(candidate.score) || candidate.score < 0 || candidate.score > 1) {
    throw new Error("Local evaluator score must be a number from 0 to 1");
  }
  if (!Array.isArray(candidate.labels) || candidate.labels.length > 5 || candidate.labels.some((label) => typeof label !== "string" || !/^[a-z_]{1,40}$/.test(label))) {
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

export function buildLocalJudgePrompt(input: {
  redactedInput: string;
  expectedOutcome: string | null;
  candidateOutput: string;
  evidence: Array<{ documentPath: string; chunkIndex: number; text: string }>;
}): string {
  return JSON.stringify({
    task: "Evaluate whether the answer addresses the request and is supported by selected local evidence.",
    output: { score: "number from 0 to 1", labels: ["supported", "unsupported", "incomplete", "off_topic", "abstained_appropriately"] },
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
  const textByKey = new Map(selectedChunks.map((chunk) => [`${chunk.documentId}:${chunk.chunkIndex}`, chunk.text]));
  return evidence
    .map((item) => ({
      documentPath: item.documentPath,
      chunkIndex: item.chunkIndex,
      text: textByKey.get(`${item.documentId}:${item.chunkIndex}`),
    }))
    .filter((item): item is { documentPath: string; chunkIndex: number; text: string } => Boolean(item.text));
}
