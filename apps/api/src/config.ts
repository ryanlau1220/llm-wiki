export type AppConfig = {
  embeddingProvider: "gemini-geap" | "gemini";
  gcpProjectId?: string;
  gcpLocation?: string;
  databaseUrl?: string;
  vaultPath: string;
  watcherDebounceMs: number;
  embeddingVersion: string;
};

export function loadConfig(): AppConfig {
  return {
    embeddingProvider: (process.env.EMBEDDING_PROVIDER as AppConfig["embeddingProvider"]) ?? "gemini-geap",
    gcpProjectId: process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT,
    gcpLocation: process.env.GEMINI_GCP_LOCATION,
    databaseUrl: process.env.DATABASE_URL,
    vaultPath: process.env.VAULT_PATH ?? "./vault/human",
    watcherDebounceMs: Number(process.env.WATCHER_DEBOUNCE_MS ?? 5000),
    embeddingVersion: process.env.EMBEDDING_VERSION ?? "v1"
  };
}
