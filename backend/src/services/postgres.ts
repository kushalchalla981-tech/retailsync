/**
 * Aiven for PostgreSQL connection singleton.
 *
 * TLS: always verify-full against the Aiven project CA. `config.ts` strips the
 * libpq `sslmode` parameter from the service URI because pg merges parsed
 * connection-string values OVER explicit options, which would silently replace
 * the CA-pinned `ssl` object below.
 */
import pg from 'pg';

import { getPostgresConfig, type PostgresConfig } from '../config.js';

export type PgPool = pg.Pool;
export type PgPoolClient = pg.PoolClient;

export const PG_APPLICATION_NAME = 'retailsync-backend';

/** Build the pg pool options for a validated config (pure, no I/O). */
export function buildPgPoolConfig(config: PostgresConfig): pg.PoolConfig {
  return {
    connectionString: config.connectionString,
    ssl: { ca: config.ssl.ca, rejectUnauthorized: config.ssl.rejectUnauthorized },
    max: config.pool.max,
    idleTimeoutMillis: config.pool.idleTimeoutMillis,
    connectionTimeoutMillis: config.pool.connectionTimeoutMillis,
    application_name: PG_APPLICATION_NAME,
  };
}

/** Create a new pool. Connections are opened lazily on first query. */
export function createPgPool(config: PostgresConfig): PgPool {
  const pool = new pg.Pool(buildPgPoolConfig(config));
  // An idle client can error (e.g. server restart / network drop). Without a
  // listener this would crash the process; the pool discards the client itself.
  pool.on('error', (error) => {
    console.error(`[postgres] idle client error: ${error.message}`);
  });
  return pool;
}

let pool: PgPool | undefined;

/** Process-wide pool, created on first use from validated environment config. */
export function getPgPool(): PgPool {
  return (pool ??= createPgPool(getPostgresConfig()));
}

/** Convenience wrapper around the shared pool. */
export function query<R extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values?: readonly unknown[],
): Promise<pg.QueryResult<R>> {
  return getPgPool().query<R>(text, values as unknown[] | undefined);
}

/**
 * Run `fn` inside BEGIN/COMMIT on a dedicated client, rolling back on error.
 * Callers use this for row-locking work such as `SELECT ... FOR UPDATE`.
 */
export async function withTransaction<T>(fn: (client: PgPoolClient) => Promise<T>): Promise<T> {
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error(`[postgres] rollback failed: ${(rollbackError as Error).message}`);
    }
    throw error;
  } finally {
    client.release();
  }
}

export interface PostgresHealth {
  latencyMs: number;
  serverVersion: string;
  /** True when the server reports this backend connection is using TLS. */
  ssl: boolean;
}

/** Round-trip health probe: proves connectivity, auth, and TLS on the wire. */
export async function checkPostgres(): Promise<PostgresHealth> {
  const started = performance.now();
  const result = await query<{ server_version: string; ssl: boolean | null }>(
    `SELECT current_setting('server_version') AS server_version,
            (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl`,
  );
  const row = result.rows[0];
  return {
    latencyMs: Math.round(performance.now() - started),
    serverVersion: row?.server_version ?? 'unknown',
    ssl: row?.ssl === true,
  };
}

/** Drain and close the shared pool (idempotent). */
export async function closePgPool(): Promise<void> {
  const current = pool;
  pool = undefined;
  if (current) await current.end();
}
