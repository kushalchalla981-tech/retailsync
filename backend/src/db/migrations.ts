/**
 * PostgreSQL migration runner.
 *
 * Applies the ordered SQL migrations (currently `schema.sql`) to Aiven
 * PostgreSQL in ONE transaction, serialised across processes by a
 * transaction-scoped advisory lock, and records each applied migration with a
 * SHA-256 checksum in `schema_migrations`:
 *
 * - pending migration          -> executed, then recorded
 * - applied, same checksum     -> skipped
 * - applied, different checksum -> refuse (an applied migration was edited;
 *                                 add a new migration instead)
 *
 * Usage:  npm run db:migrate --workspace backend
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isMainModule, runCli } from '../cli.js';
import { getPostgresConfig, PROJECT_ROOT } from '../config.js';
import { closePgPool, withTransaction } from '../services/postgres.js';

/** Ordered migration list. Append new entries; never edit an applied file. */
export const MIGRATION_FILES: readonly { id: string; file: string }[] = [
  { id: '0001_initial_schema', file: 'schema.sql' },
  { id: '0002_merchant_stores', file: '0002_merchant_stores.sql' },
];

/** Arbitrary constant key for pg_advisory_xact_lock ("RS" "MIGR" in hex). */
export const MIGRATION_LOCK_KEY = '5253004d494752';

/** Max time to wait for the advisory lock / table locks before giving up. */
export const MIGRATION_LOCK_TIMEOUT = '30s';

export const MIGRATIONS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS schema_migrations (
  id          TEXT        PRIMARY KEY,
  checksum    TEXT        NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

export interface Migration {
  id: string;
  file: string;
  sql: string;
  /** SHA-256 hex of the SQL with line endings normalised to LF. */
  checksum: string;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  /** Migrations recorded in the database that this code does not know about (DB is ahead). */
  unknown: string[];
}

/** Minimal query surface used by the runner (satisfied by pg.PoolClient). */
export interface SqlClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export class MigrationError extends Error {
  readonly migrationId: string;

  constructor(migrationId: string, message: string, options?: { cause?: unknown }) {
    super(`Migration ${migrationId}: ${message}`, options);
    this.name = 'MigrationError';
    this.migrationId = migrationId;
  }
}

export function checksumSql(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

/**
 * Locate a migration file. Under tsx the SQL sits next to this module; the
 * compiled `dist/db/*.js` does not copy .sql files, so fall back to the source tree.
 */
export function resolveMigrationPath(file: string): string {
  const candidates = [
    fileURLToPath(new URL(file, import.meta.url)),
    resolve(PROJECT_ROOT, 'backend', 'src', 'db', file),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`migration file ${file} not found (looked in: ${candidates.join(', ')})`);
  return found;
}

export function loadMigrations(files: readonly { id: string; file: string }[] = MIGRATION_FILES): Migration[] {
  return files.map(({ id, file }) => {
    const sql = readFileSync(resolveMigrationPath(file), 'utf8');
    return { id, file, sql, checksum: checksumSql(sql) };
  });
}

/** 1-based line number of a 1-based character `position` reported by PostgreSQL. */
export function lineAtPosition(sql: string, position: number): number {
  return sql.slice(0, Math.max(0, position - 1)).split('\n').length;
}

function describePgError(error: unknown, sql: string): string {
  const pgError = error as { message?: string; position?: string; code?: string };
  const message = pgError.message ?? String(error);
  const where = pgError.position ? ` at line ${lineAtPosition(sql, Number(pgError.position))}` : '';
  const code = pgError.code ? ` [SQLSTATE ${pgError.code}]` : '';
  return `failed${where}: ${message}${code}`;
}

/**
 * Apply pending migrations using `client`. MUST be called inside a transaction
 * (see `migrate()`), so the advisory lock and all DDL commit or roll back together.
 */
export async function applyMigrations(client: SqlClient, migrations: readonly Migration[]): Promise<MigrationResult> {
  await client.query(`SET LOCAL lock_timeout = '${MIGRATION_LOCK_TIMEOUT}'`);
  await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [BigInt(`0x${MIGRATION_LOCK_KEY}`).toString()]);
  await client.query(MIGRATIONS_TABLE_DDL);

  const { rows } = await client.query('SELECT id, checksum FROM schema_migrations ORDER BY id');
  const recorded = new Map((rows as { id: string; checksum: string }[]).map((row) => [row.id, row.checksum]));

  // Validate everything before executing anything.
  for (const migration of migrations) {
    const checksum = recorded.get(migration.id);
    if (checksum !== undefined && checksum !== migration.checksum) {
      throw new MigrationError(
        migration.id,
        `${migration.file} changed after it was applied (recorded checksum ${checksum.slice(0, 12)}..., ` +
          `current ${migration.checksum.slice(0, 12)}...). Add a new migration instead of editing an applied one.`,
      );
    }
  }

  const result: MigrationResult = { applied: [], skipped: [], unknown: [] };
  const known = new Set(migrations.map((m) => m.id));
  result.unknown = [...recorded.keys()].filter((id) => !known.has(id));

  for (const migration of migrations) {
    if (recorded.has(migration.id)) {
      result.skipped.push(migration.id);
      continue;
    }
    try {
      // No bind values -> simple query protocol, which allows multiple statements.
      await client.query(migration.sql);
    } catch (error) {
      throw new MigrationError(migration.id, describePgError(error, migration.sql), { cause: error });
    }
    await client.query('INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)', [migration.id, migration.checksum]);
    result.applied.push(migration.id);
  }
  return result;
}

/** Apply all pending migrations to the configured Aiven PostgreSQL database. */
export async function migrate(migrations: readonly Migration[] = loadMigrations()): Promise<MigrationResult> {
  return withTransaction((client) => applyMigrations(client, migrations));
}

async function main(): Promise<void> {
  const config = getPostgresConfig();
  const migrations = loadMigrations();
  console.log(
    `[db:migrate] target ${config.host}:${config.port}/${config.database} as ${config.user} ` +
      `(${migrations.length} migration(s) known)`,
  );
  const started = performance.now();
  const result = await migrate(migrations);
  const ms = Math.round(performance.now() - started);
  for (const id of result.applied) console.log(`[db:migrate] applied  ${id}`);
  for (const id of result.skipped) console.log(`[db:migrate] up to date ${id}`);
  for (const id of result.unknown) console.warn(`[db:migrate] WARNING: database has unknown migration ${id} (newer code?)`);
  console.log(`[db:migrate] done in ${ms} ms: ${result.applied.length} applied, ${result.skipped.length} already applied`);
}

if (isMainModule(import.meta.url)) {
  await runCli('db:migrate', main, closePgPool);
}
