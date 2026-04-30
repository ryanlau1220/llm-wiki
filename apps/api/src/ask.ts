import { createEmbeddingProvider } from "@llm-wiki/ai";
import { hybridRetrieve } from "@llm-wiki/core";
import { createDbClient } from "@llm-wiki/db";

import type { AppConfig } from "./config";

export async function askPreview(
  config: AppConfig,
  query: string,
  topK?: number
) {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const { db } = createDbClient(config.databaseUrl);
  const embeddingProvider = createEmbeddingProvider({
    provider: config.embeddingProvider,
    geminiGeap: {
      projectId: config.gcpProjectId,
      location: config.gcpLocation
    }
  });

  return hybridRetrieve(
    {
      db,
      embeddingProvider
    },
    {
      query,
      topK
    }
  );
}
