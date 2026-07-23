import { createEmbeddingProvider } from "@llm-wiki/ai";
import {
  evaluateRetrieval,
  hybridRetrieve,
  LOCAL_VAULT_GOLDEN_CASES,
} from "@llm-wiki/core";
import { createDbClient } from "@llm-wiki/db";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const { db, pool } = createDbClient(databaseUrl);
const embeddingProvider = createEmbeddingProvider();

try {
  const retrievedByCase = new Map<string, Array<{ documentPath: string; chunkIndex: number }>>();
  for (const evaluationCase of LOCAL_VAULT_GOLDEN_CASES) {
    const response = await hybridRetrieve(
      { db, embeddingProvider },
      { query: evaluationCase.query },
    );
    retrievedByCase.set(evaluationCase.id, response.chunks);
  }

  console.info(JSON.stringify({
    evaluation: "local-vault-golden",
    metrics: evaluateRetrieval(LOCAL_VAULT_GOLDEN_CASES, retrievedByCase),
  }));
} finally {
  await pool.end();
}
