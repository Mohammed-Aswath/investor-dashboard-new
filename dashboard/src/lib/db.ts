import { Pool, type QueryResultRow } from "pg";
import { getDatabaseUrl } from "./env";

let pool: Pool | null = null;

export function getPool(): Pool {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is not set in investor-analytics/.env");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 4,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function queryOne<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const result = await getPool().query<T>(sql, params);
  return (result.rows[0] ?? {}) as T;
}
