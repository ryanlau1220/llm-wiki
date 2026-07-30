import path from "node:path";
import { fileURLToPath } from "node:url";

export type AppConfig = {
  apiPort: number;
  embeddingProvider: "gemini-geap" | "gemini" | "ollama" | "openai" | "fallback";
  llmProvider: "gemini-geap" | "gemini" | "ollama" | "openai" | "fallback";
  gcpProjectId?: string;
  gcpLocation?: string;
  gcpLlmModel?: string;
  gcpEmbeddingModel?: string;
  geminiApiKey?: string;
  ollamaBaseUrl?: string;
  ollamaEmbeddingModel?: string;
  ollamaLlmModel?: string;
  /** Kept separate from the target model so a local model does not grade itself by default. */
  ollamaEvaluatorModel?: string;
  evaluatorMode: "auto" | "local" | "cloud";
  cloudEvaluatorProvider?: "gemini" | "gemini-geap" | "openai";
  cloudEvaluatorModel?: string;
  /** Explicit owner consent before vault-derived output or evidence can leave this machine. */
  allowCloudVaultEvaluation: boolean;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiLlmModel?: string;
  openaiEmbeddingModel?: string;
  jwtSecret: string;
  databaseUrl?: string;
  vaultPath: string;
  watcherDebounceMs: number;
  embeddingVersion: string;
  semanticDuplicateThreshold: number;
  semanticDuplicateCandidates: number;
  tavilyApiKey?: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Monorepo root is 3 levels up from apps/api/src/config.ts (src -> api -> apps -> root)
const ROOT_DIR = path.resolve(__dirname, "../../..");
const DEFAULT_API_PORT = 3001;
const DEFAULT_WATCHER_DEBOUNCE_MS = 5_000;
const DEFAULT_EMBEDDING_VERSION = "v1";
const DEFAULT_SEMANTIC_DUPLICATE_THRESHOLD = 0.92;
const DEFAULT_SEMANTIC_DUPLICATE_CANDIDATES = 200;
const MIN_TCP_PORT = 1;
const MAX_TCP_PORT = 65_535;

let cachedConfig: AppConfig | null = null;

function readApiPort(rawPort: string | undefined): number {
  const port = Number(rawPort ?? DEFAULT_API_PORT);
  if (!Number.isInteger(port) || port < MIN_TCP_PORT || port > MAX_TCP_PORT) {
    throw new Error(`API_PORT must be an integer between ${MIN_TCP_PORT} and ${MAX_TCP_PORT}`);
  }
  return port;
}

function readEvaluatorMode(value: string | undefined): AppConfig["evaluatorMode"] {
  if (!value || value === "auto") return "auto";
  if (value === "local" || value === "cloud") return value;
  throw new Error("EVALUATOR_MODE must be one of: auto, local, cloud");
}

function readCloudEvaluatorProvider(value: string | undefined): AppConfig["cloudEvaluatorProvider"] {
  if (!value) return undefined;
  if (value === "gemini" || value === "gemini-geap" || value === "openai") return value;
  throw new Error("CLOUD_EVALUATOR_PROVIDER must be one of: gemini, gemini-geap, openai");
}

function readBoolean(value: string | undefined, name: string): boolean {
  if (!value) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function optionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function loadConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT;

  console.log("[Config] DATABASE_URL found:", !!process.env.DATABASE_URL);
  console.log("[Config] GOOGLE_CLOUD_PROJECT found:", !!gcpProjectId);

  const rawVaultPath = process.env.VAULT_PATH ?? "./vault";
  const resolvedVaultPath = path.isAbsolute(rawVaultPath) 
    ? rawVaultPath 
    : path.resolve(ROOT_DIR, rawVaultPath);

  console.log("[Config] Default fallback VAULT_PATH:", resolvedVaultPath);

  cachedConfig = {
    apiPort: readApiPort(process.env.API_PORT),
    embeddingProvider: (process.env.EMBEDDING_PROVIDER as AppConfig["embeddingProvider"]) ?? "fallback",
    // Preserve existing installations until they explicitly set LLM_PROVIDER.
    llmProvider: (process.env.LLM_PROVIDER as AppConfig["llmProvider"])
      ?? (process.env.EMBEDDING_PROVIDER as AppConfig["llmProvider"])
      ?? "fallback",
    gcpProjectId,
    gcpLocation: process.env.GEMINI_GCP_LOCATION,
    gcpLlmModel: process.env.GEMINI_GCP_LLM_MODEL,
    gcpEmbeddingModel: process.env.GEMINI_GCP_EMBEDDING_MODEL,
    geminiApiKey: process.env.GEMINI_API_KEY,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
    ollamaEmbeddingModel: process.env.OLLAMA_EMBEDDING_MODEL,
    ollamaLlmModel: process.env.OLLAMA_LLM_MODEL,
    ollamaEvaluatorModel: optionalValue(process.env.OLLAMA_EVALUATOR_MODEL),
    evaluatorMode: readEvaluatorMode(process.env.EVALUATOR_MODE),
    cloudEvaluatorProvider: readCloudEvaluatorProvider(process.env.CLOUD_EVALUATOR_PROVIDER),
    cloudEvaluatorModel: optionalValue(process.env.CLOUD_EVALUATOR_MODEL),
    allowCloudVaultEvaluation: readBoolean(process.env.ALLOW_CLOUD_VAULT_EVALUATION, "ALLOW_CLOUD_VAULT_EVALUATION"),
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiBaseUrl: process.env.OPENAI_BASE_URL,
    openaiLlmModel: process.env.OPENAI_LLM_MODEL,
    openaiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
    jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
    databaseUrl: process.env.DATABASE_URL,
    vaultPath: resolvedVaultPath,
    watcherDebounceMs: Number(process.env.WATCHER_DEBOUNCE_MS ?? DEFAULT_WATCHER_DEBOUNCE_MS),
    embeddingVersion: process.env.EMBEDDING_VERSION ?? DEFAULT_EMBEDDING_VERSION,
    semanticDuplicateThreshold: Number(process.env.SEMANTIC_DUPLICATE_THRESHOLD ?? DEFAULT_SEMANTIC_DUPLICATE_THRESHOLD),
    semanticDuplicateCandidates: Number(process.env.SEMANTIC_DUPLICATE_CANDIDATES ?? DEFAULT_SEMANTIC_DUPLICATE_CANDIDATES),
    tavilyApiKey: process.env.TAVILY_API_KEY
  };

  return cachedConfig;
}
