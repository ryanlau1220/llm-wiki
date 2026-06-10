import path from "node:path";
import { fileURLToPath } from "node:url";

export type AppConfig = {
  embeddingProvider: "gemini-geap" | "gemini" | "ollama" | "openai" | "fallback";
  gcpProjectId?: string;
  gcpLocation?: string;
  gcpLlmModel?: string;
  gcpEmbeddingModel?: string;
  ollamaBaseUrl?: string;
  ollamaEmbeddingModel?: string;
  ollamaLlmModel?: string;
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

export function loadConfig(): AppConfig {
  const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT;

  console.log("[Config] DATABASE_URL found:", !!process.env.DATABASE_URL);
  console.log("[Config] GOOGLE_CLOUD_PROJECT found:", !!gcpProjectId);

  const rawVaultPath = process.env.VAULT_PATH ?? "./vault/human";
  const resolvedVaultPath = path.isAbsolute(rawVaultPath) 
    ? rawVaultPath 
    : path.resolve(ROOT_DIR, rawVaultPath);

  console.log("[Config] Resolved VAULT_PATH:", resolvedVaultPath);

  return {
    embeddingProvider: (process.env.EMBEDDING_PROVIDER as AppConfig["embeddingProvider"]) ?? "fallback",
    gcpProjectId,
    gcpLocation: process.env.GEMINI_GCP_LOCATION,
    gcpLlmModel: process.env.GEMINI_GCP_LLM_MODEL,
    gcpEmbeddingModel: process.env.GEMINI_GCP_EMBEDDING_MODEL,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
    ollamaEmbeddingModel: process.env.OLLAMA_EMBEDDING_MODEL,
    ollamaLlmModel: process.env.OLLAMA_LLM_MODEL,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiBaseUrl: process.env.OPENAI_BASE_URL,
    openaiLlmModel: process.env.OPENAI_LLM_MODEL,
    openaiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
    jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
    databaseUrl: process.env.DATABASE_URL,
    vaultPath: resolvedVaultPath,
    watcherDebounceMs: Number(process.env.WATCHER_DEBOUNCE_MS ?? 5000),
    embeddingVersion: process.env.EMBEDDING_VERSION ?? "v1",
    semanticDuplicateThreshold: Number(process.env.SEMANTIC_DUPLICATE_THRESHOLD ?? 0.92),
    semanticDuplicateCandidates: Number(process.env.SEMANTIC_DUPLICATE_CANDIDATES ?? 200),
    tavilyApiKey: process.env.TAVILY_API_KEY
  };
}
