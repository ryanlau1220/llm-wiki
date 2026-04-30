import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

export type DbClient = NodePgDatabase<typeof schema>;

export type DbClientHandle = {
  db: DbClient;
  pool: Pool;
};

export function createDbClient(databaseUrl: string): DbClientHandle {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to create a DB client");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  return { db, pool };
}
