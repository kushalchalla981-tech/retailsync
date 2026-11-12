/**
 * Hermetic tests for the migration runner, using a scripted fake SQL client
 * (no PostgreSQL connection is opened).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { isMainModule } from '../cli.js';
import {
  applyMigrations,
  checksumSql,
  lineAtPosition,
  loadMigrations,
  MIGRATION_FILES,
  MigrationError,
  resolveMigrationPath,
  type Migration,
  type SqlClient,
} from './migrations.js';

interface Call {
  text: string;
  values?: unknown[];
}

/** Fake client: records queries; `schema_migrations` reads return `recorded`. */
function fakeClient(recorded: { id: string; checksum: string }[] = [], failOn?: (text: string) => Error | undefined) {
  const calls: Call[] = [];
  const client: SqlClient = {
    async query(text, values) {
      calls.push(values === undefined ? { text } : { text, values });
      const failure = failOn?.(text);
      if (failure) throw failure;
      if (text.startsWith('SELECT id, checksum FROM schema_migrations')) return { rows: recorded };
      return { rows: [] };
    },
  };
  return { client, calls };
}

const m1: Migration = { id: '0001_a', file: 'a.sql', sql: 'CREATE TABLE IF NOT EXISTS a (id int);', checksum: checksumSql('CREATE TABLE IF NOT EXISTS a (id int);') };
const m2: Migration = { id: '0002_b', file: 'b.sql', sql: 'CREATE TABLE IF NOT EXISTS b (id int);', checksum: checksumSql('CREATE TABLE IF NOT EXISTS b (id int);') };

describe('migration loading', () => {
  it('loads schema.sql as 0001_initial_schema with a SHA-256 checksum', () => {
    const [first, ...rest] = loadMigrations();
    assert.equal(rest.length, MIGRATION_FILES.length - 1);
    assert.ok(first);
    assert.equal(first.id, '0001_initial_schema');
    assert.equal(first.sql, readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    assert.match(first.checksum, /^[0-9a-f]{64}$/);
  });

  it('checksums ignore CRLF vs LF line endings', () => {
    assert.equal(checksumSql('a\r\nb\r\n'), checksumSql('a\nb\n'));
    assert.notEqual(checksumSql('a\nb\n'), checksumSql('a\nc\n'));
  });

  it('resolves SQL files and reports missing ones clearly', () => {
    assert.match(resolveMigrationPath('schema.sql'), /schema\.sql$/);
    assert.throws(() => resolveMigrationPath('nope.sql'), /migration file nope\.sql not found/);
  });

  it('migration ids are unique and ordered', () => {
    const ids = MIGRATION_FILES.map((m) => m.id);
    assert.deepEqual(ids, [...new Set(ids)].sort());
  });
});

describe('applyMigrations', () => {
  it('takes the lock timeout and advisory lock before any DDL, then applies and records pending migrations', async () => {
    const { client, calls } = fakeClient();
    const result = await applyMigrations(client, [m1, m2]);

    assert.deepEqual(result, { applied: ['0001_a', '0002_b'], skipped: [], unknown: [] });
    assert.match(calls[0]!.text, /^SET LOCAL lock_timeout = '30s'$/);
    assert.match(calls[1]!.text, /^SELECT pg_advisory_xact_lock\(\$1::bigint\)$/);
    assert.match(String(calls[1]!.values?.[0]), /^\d+$/);
    assert.match(calls[2]!.text, /^CREATE TABLE IF NOT EXISTS schema_migrations/);
    assert.deepEqual(
      calls.slice(4).map((c) => [c.text, c.values]),
      [
        [m1.sql, undefined],
        ['INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)', ['0001_a', m1.checksum]],
        [m2.sql, undefined],
        ['INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)', ['0002_b', m2.checksum]],
      ],
    );
  });

  it('executes migration SQL without bind values (simple protocol allows multiple statements)', async () => {
    const { client, calls } = fakeClient();
    await applyMigrations(client, loadMigrations());
    const schemaCall = calls.find((c) => c.text.includes('CREATE TABLE IF NOT EXISTS inventory'));
    assert.ok(schemaCall);
    assert.equal(schemaCall.values, undefined);
  });

  it('is a no-op for migrations already applied with the same checksum', async () => {
    const { client, calls } = fakeClient([{ id: '0001_a', checksum: m1.checksum }]);
    const result = await applyMigrations(client, [m1, m2]);
    assert.deepEqual(result, { applied: ['0002_b'], skipped: ['0001_a'], unknown: [] });
    assert.ok(!calls.some((c) => c.text === m1.sql), 'applied migration is not re-executed');
  });

  it('refuses to run anything when an applied migration was edited', async () => {
    const { client, calls } = fakeClient([{ id: '0001_a', checksum: 'f'.repeat(64) }]);
    await assert.rejects(applyMigrations(client, [m1, m2]), (error: unknown) => {
      assert.ok(error instanceof MigrationError);
      assert.equal(error.migrationId, '0001_a');
      assert.match(error.message, /changed after it was applied/);
      return true;
    });
    assert.ok(!calls.some((c) => c.text === m1.sql || c.text === m2.sql), 'nothing executed');
  });

  it('reports database migrations unknown to this code without failing', async () => {
    const { client } = fakeClient([
      { id: '0001_a', checksum: m1.checksum },
      { id: '0099_future', checksum: 'x' },
    ]);
    const result = await applyMigrations(client, [m1]);
    assert.deepEqual(result, { applied: [], skipped: ['0001_a'], unknown: ['0099_future'] });
  });

  it('wraps SQL errors with the migration id, line number, and SQLSTATE', async () => {
    const sql = 'CREATE TABLE IF NOT EXISTS ok (id int);\nCREATE TABLE broken (;\n';
    const bad: Migration = { id: '0003_bad', file: 'bad.sql', sql, checksum: checksumSql(sql) };
    const pgError = Object.assign(new Error('syntax error at or near ";"'), { position: String(sql.indexOf('(;') + 2), code: '42601' });
    const { client, calls } = fakeClient([], (text) => (text === sql ? pgError : undefined));

    await assert.rejects(applyMigrations(client, [bad]), (error: unknown) => {
      assert.ok(error instanceof MigrationError);
      assert.equal(error.message, 'Migration 0003_bad: failed at line 2: syntax error at or near ";" [SQLSTATE 42601]');
      assert.equal((error as Error).cause, pgError);
      return true;
    });
    assert.ok(!calls.some((c) => c.text.startsWith('INSERT INTO schema_migrations')), 'failed migration is not recorded');
  });
});

describe('helpers', () => {
  it('lineAtPosition maps 1-based positions to lines', () => {
    const sql = 'a\nbb\nccc';
    assert.equal(lineAtPosition(sql, 1), 1);
    assert.equal(lineAtPosition(sql, 3), 2);
    assert.equal(lineAtPosition(sql, 6), 3);
  });

  it('isMainModule is false on import and true for the entry file', () => {
    assert.equal(isMainModule(new URL('./migrations.ts', import.meta.url).href), false);
    assert.equal(isMainModule(import.meta.url, new URL(import.meta.url).pathname), true);
    assert.equal(isMainModule(import.meta.url, ''), false, 'no entry script (e.g. REPL)');
    assert.equal(isMainModule(import.meta.url, '/nonexistent/entry.js'), false);
  });
});
