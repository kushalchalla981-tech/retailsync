/**
 * Scripted fake `Database` for offline route tests (no Aiven, no pg).
 *
 * Every query is recorded in `calls` (SQL text, bound values, and whether it
 * ran inside `transaction()`), and transaction boundaries are recorded in
 * `events`. `respond(call)` decides each query's outcome:
 *   - an array of rows  -> resolved with those rows (rowCount = rows.length)
 *   - an Error          -> the query rejects with it
 *   - undefined         -> resolved with no rows
 *
 * A plain helper, deliberately free of node:test imports (not a test file).
 */
import type { Database, Queryable, QueryResult } from '../store/db.js';

export interface FakeCall {
  text: string;
  values: unknown[];
  inTransaction: boolean;
}

export type FakeResponse = readonly object[] | Error | undefined;

export type FakeResponder = (call: FakeCall) => FakeResponse | Promise<FakeResponse>;

export type TransactionEvent = 'begin' | 'commit' | 'rollback';

export interface FakeDatabase extends Database {
  calls: FakeCall[];
  events: TransactionEvent[];
}

export function createFakeDatabase(respond: FakeResponder = () => undefined): FakeDatabase {
  const calls: FakeCall[] = [];
  const events: TransactionEvent[] = [];

  async function run<R extends object>(text: string, values: unknown[] | undefined, inTransaction: boolean): Promise<QueryResult<R>> {
    const call: FakeCall = { text, values: values ?? [], inTransaction };
    calls.push(call);
    const outcome = await respond(call);
    if (outcome instanceof Error) throw outcome;
    const rows = (outcome ?? []) as R[];
    return { rows: [...rows], rowCount: rows.length };
  }

  return {
    calls,
    events,
    query<R extends object>(text: string, values?: unknown[]) {
      return run<R>(text, values, false);
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      events.push('begin');
      const tx: Queryable = {
        query<R extends object>(text: string, values?: unknown[]) {
          return run<R>(text, values, true);
        },
      };
      try {
        const result = await fn(tx);
        events.push('commit');
        return result;
      } catch (error) {
        events.push('rollback');
        throw error;
      }
    },
  };
}
