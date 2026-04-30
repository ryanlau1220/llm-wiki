export type AppConfig = {
  embeddingProvider: "gemini-geap" | "gemini";
  gcpProjectId?: string;
  gcpLocation?: string;
  databaseUrl?: string;
};

export function loadConfig(): AppConfig {
  return {
    embeddingProvider: (process.env.EMBEDDING_PROVIDER as AppConfig["embeddingProvider"]) ?? "gemini-geap",
    gcpProjectId: process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT,
    gcpLocation: process.env.GEMINI_GCP_LOCATION,
    databaseUrl: process.env.DATABASE_URL
  };
}
