export type AppConfig = {
  embeddingProvider: "gemini-geap" | "gemini" | "ollama";
  gcpProjectId?: string;
  gcpLocation?: string;
  gcpLlmModel?: string;
  gcpEmbeddingModel?: string;
  ollamaBaseUrl?: string;
  ollamaEmbeddingModel?: string;
  ollamaLlmModel?: string;
  jwtSecret: string;
  databaseUrl?: string;
  vaultPath: string;
  watcherDebounceMs: number;
  embeddingVersion: string;
  semanticDuplicateThreshold: number;
  semanticDuplicateCandidates: number;
};

export function loadConfig(): AppConfig {
  const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT;

  console.log("[Config] DATABASE_URL found:", !!process.env.DATABASE_URL);
  console.log("[Config] GOOGLE_CLOUD_PROJECT found:", !!gcpProjectId);

  return {
    embeddingProvider: (process.env.EMBEDDING_PROVIDER as AppConfig["embeddingProvider"]) ?? (gcpProjectId ? "gemini-geap" : "gemini"),
    gcpProjectId,
    gcpLocation: process.env.GEMINI_GCP_LOCATION,
    gcpLlmModel: process.env.GEMINI_GCP_LLM_MODEL,
    gcpEmbeddingModel: process.env.GEMINI_GCP_EMBEDDING_MODEL,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
    ollamaEmbeddingModel: process.env.OLLAMA_EMBEDDING_MODEL,
    ollamaLlmModel: process.env.OLLAMA_LLM_MODEL,
    jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
    databaseUrl: process.env.DATABASE_URL,
    vaultPath: process.env.VAULT_PATH ?? "./vault/human",
    watcherDebounceMs: Number(process.env.WATCHER_DEBOUNCE_MS ?? 5000),
    embeddingVersion: process.env.EMBEDDING_VERSION ?? "v1",
    semanticDuplicateThreshold: Number(process.env.SEMANTIC_DUPLICATE_THRESHOLD ?? 0.92),
    semanticDuplicateCandidates: Number(process.env.SEMANTIC_DUPLICATE_CANDIDATES ?? 200)
  };
}
