/**
 * Data-access seam for the store engine.
 *
 * Store modules depend on these small interfaces instead of pg directly so
 * offline route tests can inject a scripted fake (testing/fake-db.ts), while
 * production uses `pgDatabase()` over the shared Aiven PostgreSQL pool.
 */
import { query, withTransaction } from '../services/postgres.js';

export interface QueryResult<R> {
  rows: R[];
  rowCount: number | null;
}

/** Minimal query interface (pg Pool / PoolClient satisfy it). */
export interface Queryable {
  query<R extends object = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

export interface Database extends Queryable {
  /** BEGIN / COMMIT around `fn`; ROLLBACK and rethrow when it rejects. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

/**
 * Database backed by the shared pg pool. The pool (and the PostgreSQL config
 * it validates) is only touched on the first query, so building the app never
 * requires credentials.
 */
export function pgDatabase(): Database {
  return {
    async query<R extends object>(text: string, values?: unknown[]): Promise<QueryResult<R>> {
      const result = await query(text, values);
      return { rows: result.rows as R[], rowCount: result.rowCount };
    },
    transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      return withTransaction((client) =>
        fn({
          async query<R extends object>(text: string, values?: unknown[]): Promise<QueryResult<R>> {
            const result = await client.query(text, values);
            return { rows: result.rows as R[], rowCount: result.rowCount };
          },
        }),
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

/** NUMERIC (returned by pg as a string) -> JSON number. Arithmetic stays in SQL. */
export function money(value: string | number | null): number {
  if (value === null) return 0;
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) throw new Error('invalid NUMERIC value from database');
  return amount;
}

/** TIMESTAMPTZ (Date from pg, or an ISO-ish string) -> ISO-8601 string. */
export function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
