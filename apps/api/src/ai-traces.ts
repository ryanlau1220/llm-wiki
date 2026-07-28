import { getAiTrace, listAiTraces, type AiTracePage, type AiTraceRun } from "@llm-wiki/core";
import { createDbClient } from "@llm-wiki/db";
import type { ListAiTracesInput } from "@llm-wiki/types";

import type { AppConfig } from "./config";

function requireDatabase(config: Pick<AppConfig, "databaseUrl">): string {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required for AI Generator Inspect");
  return config.databaseUrl;
}

export async function listAiTracePage(config: Pick<AppConfig, "databaseUrl">, input: ListAiTracesInput = undefined): Promise<AiTracePage> {
  const { db } = createDbClient(requireDatabase(config));
  return listAiTraces(db, input ?? {});
}

export async function getAiTraceDetail(config: Pick<AppConfig, "databaseUrl">, traceId: string): Promise<AiTraceRun | null> {
  const { db } = createDbClient(requireDatabase(config));
  return getAiTrace(db, traceId);
}
