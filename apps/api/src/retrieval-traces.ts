import {
  listRetrievalRuns,
  pruneRetrievalRuns,
  type PruneRetrievalRunsResult,
  type RetrievalTracePage,
} from "@llm-wiki/core";
import { createDbClient } from "@llm-wiki/db";
import type { ListRetrievalTracesInput, PruneRetrievalTracesInput } from "@llm-wiki/types";

import type { AppConfig } from "./config";

function requireDatabase(config: Pick<AppConfig, "databaseUrl">): string {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required for retrieval trace observability");
  }
  return config.databaseUrl;
}

export async function listRetrievalTracePage(
  config: Pick<AppConfig, "databaseUrl">,
  input: ListRetrievalTracesInput = undefined,
): Promise<RetrievalTracePage> {
  const { db } = createDbClient(requireDatabase(config));
  return listRetrievalRuns(db, input ?? {});
}

export async function pruneRetrievalTraceRuns(
  config: Pick<AppConfig, "databaseUrl">,
  input: PruneRetrievalTracesInput,
): Promise<PruneRetrievalRunsResult> {
  const { db } = createDbClient(requireDatabase(config));
  return pruneRetrievalRuns(db, input);
}
