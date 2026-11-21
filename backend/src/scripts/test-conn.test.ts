/**
 * Hermetic tests for the connectivity diagnostics: probe logic runs against
 * fake PostgreSQL / Kafka / OpenSearch clients (no network). The live run
 * against Aiven is pending credentials.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { EachMessagePayload, ITopicConfig, RecordMetadata } from 'kafkajs';

import { ConfigError } from '../config.js';
import {
  CATALOG_COUNTS_SQL,
  DIAGNOSTICS_GROUP_PREFIX,
  DIAGNOSTICS_TOPIC,
  exitCodeFor,
  formatLatency,
  formatReport,
  kafkaProbe,
  openSearchProbe,
  parseTestConnArgs,
  postgresProbe,
  runDiagnostics,
  runProbe,
  SCHEMA_PRESENCE_SQL,
  shouldColor,
  withTimeout,
  type KafkaProbeAdmin,
  type KafkaProbeConsumer,
  type OpenSearchProbeDeps,
  type PostgresProbeDeps,
  type Probe,
  type ProbeResult,
} from './test-conn.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ANSI_PATTERN = /\x1b\[[0-9;]*m/;

function probe(service: string, run: Probe['run'], timeoutMs = 1_000): Probe {
  return { service, timeoutMs, run };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

describe('probe runner', () => {
  it('withTimeout resolves fast promises and rejects slow ones with the label', async () => {
    assert.equal(await withTimeout(Promise.resolve(7), 50, 'x'), 7);
    await assert.rejects(withTimeout(sleep(200), 20, 'Kafka'), /Kafka timed out after 20 ms/);
  });

  it('classifies pass / warn / fail and measures latency', async () => {
    const pass = await runProbe(probe('A', async () => ({ details: ['ok'], warnings: [] })));
    assert.equal(pass.status, 'pass');
    assert.deepEqual(pass.details, ['ok']);
    assert.ok(pass.latencyMs >= 0);

    const warn = await runProbe(probe('B', async () => ({ details: [], warnings: ['not seeded'] })));
    assert.equal(warn.status, 'warn');

    const fail = await runProbe(
      probe('C', async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:1');
      }),
    );
    assert.equal(fail.status, 'fail');
    assert.equal(fail.error, 'connect ECONNREFUSED 127.0.0.1:1');
  });

  it('turns a synchronous throw into a fail result instead of crashing', async () => {
    const result = await runProbe(
      probe('Sync', () => {
        throw new Error('boom');
      }),
    );
    assert.equal(result.status, 'fail');
    assert.equal(result.error, 'boom');
  });

  it('reports configuration errors by variable name only', async () => {
    const result = await runProbe(
      probe('PostgreSQL', async () => {
        throw new ConfigError(['AIVEN_PG_URI: is required (Aiven PostgreSQL service URI)']);
      }),
    );
    assert.equal(result.status, 'fail');
    assert.equal(result.error, 'configuration invalid:\n  AIVEN_PG_URI: is required (Aiven PostgreSQL service URI)');
    assert.doesNotMatch(result.error!, /\.env\.example/);
  });

  it('fails a probe that exceeds its timeout', async () => {
    const result = await runProbe(probe('Slow', () => new Promise(() => {}), 30));
    assert.equal(result.status, 'fail');
    assert.match(result.error!, /Slow timed out after 30 ms/);
  });

  it('runs probes concurrently and keeps their order', async () => {
    const started = performance.now();
    const results = await runDiagnostics([
      probe('first', async () => {
        await sleep(80);
        return { details: [], warnings: [] };
      }),
      probe('second', async () => {
        await sleep(80);
        return { details: [], warnings: [] };
      }),
      probe('third', async () => {
        await sleep(80);
        return { details: [], warnings: [] };
      }),
    ]);
    const elapsed = performance.now() - started;
    assert.deepEqual(
      results.map((r) => r.service),
      ['first', 'second', 'third'],
    );
    assert.ok(elapsed < 200, `expected parallel execution, took ${Math.round(elapsed)} ms`);
  });

  it('exit code is 1 only when a service fails', () => {
    const r = (status: ProbeResult['status']): ProbeResult => ({ service: status, status, latencyMs: 1, details: [], warnings: [] });
    assert.equal(exitCodeFor([r('pass'), r('pass'), r('pass')]), 0);
    assert.equal(exitCodeFor([r('pass'), r('warn'), r('warn')]), 0);
    assert.equal(exitCodeFor([r('pass'), r('warn'), r('fail')]), 1);
  });
});

// ---------------------------------------------------------------------------
// PostgreSQL probe
// ---------------------------------------------------------------------------

function fakePg(options: { ssl?: boolean; migrated?: boolean; products?: number } = {}): PostgresProbeDeps & { sql: string[] } {
  const sql: string[] = [];
  return {
    sql,
    async check() {
      return { latencyMs: 12, serverVersion: '16.4', ssl: options.ssl ?? true };
    },
    async query<R>(text: string) {
      sql.push(text);
      if (text === SCHEMA_PRESENCE_SQL) {
        const migrated = options.migrated ?? true;
        return { rows: [{ migrations_table: migrated, products_table: migrated }] as R[] };
      }
      if (text === CATALOG_COUNTS_SQL) {
        return { rows: [{ migrations: 1, products: options.products ?? 60, locations: 3, inventory_rows: 170 }] as R[] };
      }
      throw new Error(`unexpected SQL ${text}`);
    },
  };
}

describe('PostgreSQL probe', () => {
  it('passes when connected over TLS, migrated, and seeded', async () => {
    const result = await runProbe(postgresProbe(fakePg()));
    assert.equal(result.status, 'pass');
    assert.match(result.details.join('\n'), /PostgreSQL 16\.4, query round-trip 12 ms/);
    assert.match(result.details.join('\n'), /TLS: on/);
    assert.match(result.details.join('\n'), /60 products, 3 store locations, 170 inventory rows/);
  });

  it('warns (not fails) when the schema is not migrated, without querying missing tables', async () => {
    const pg = fakePg({ migrated: false });
    const result = await runProbe(postgresProbe(pg));
    assert.equal(result.status, 'warn');
    assert.deepEqual(result.warnings, ['schema not migrated - run: npm run db:migrate']);
    assert.ok(!pg.sql.includes(CATALOG_COUNTS_SQL));
  });

  it('warns when the catalog is empty', async () => {
    const result = await runProbe(postgresProbe(fakePg({ products: 0 })));
    assert.equal(result.status, 'warn');
    assert.deepEqual(result.warnings, ['catalog is empty - run: npm run seed']);
  });

  it('warns when the server does not report TLS', async () => {
    const result = await runProbe(postgresProbe(fakePg({ ssl: false })));
    assert.equal(result.status, 'warn');
    assert.match(result.warnings[0]!, /TLS/);
  });

  it('fails when the connection is refused', async () => {
    const pg = fakePg();
    pg.check = async () => {
      throw new Error('password authentication failed for user "avnadmin"');
    };
    const result = await runProbe(postgresProbe(pg));
    assert.equal(result.status, 'fail');
    assert.match(result.error!, /password authentication failed/);
  });
});

// ---------------------------------------------------------------------------
// Kafka probe
// ---------------------------------------------------------------------------

interface KafkaWorld {
  brokers: number;
  topics: Set<string>;
  log: { key: string; value: string }[];
  created: ITopicConfig[];
  deletedGroups: string[];
  consumers: { groupId: string; connected: boolean; disconnected: boolean; autoCommit?: boolean }[];
  /** Simulate a broker that never delivers the probe back. */
  deliver: boolean;
  corruptPayload: boolean;
  createError?: Error;
  sends: number;
}

function kafkaWorld(overrides: Partial<KafkaWorld> = {}): KafkaWorld {
  return {
    brokers: 3,
    topics: new Set(['orders.placed', 'inventory.updated', 'retailsync-orders', 'retailsync-inventory', DIAGNOSTICS_TOPIC]),
    log: [{ key: 'older-probe', value: '{}' }],
    created: [],
    deletedGroups: [],
    consumers: [],
    deliver: true,
    corruptPayload: false,
    sends: 0,
    ...overrides,
  };
}

function kafkaDeps(world: KafkaWorld, extra: { roundTrip?: boolean } = {}) {
  const admin: KafkaProbeAdmin = {
    async describeCluster() {
      return {
        brokers: Array.from({ length: world.brokers }, (_, nodeId) => ({ nodeId, host: `b${nodeId}`, port: 12345 })),
        controller: 1,
        clusterId: 'aiven-test',
      };
    },
    async listTopics() {
      return [...world.topics];
    },
    async createTopics({ topics }) {
      if (world.createError) throw world.createError;
      world.created.push(...topics);
      for (const t of topics) world.topics.add(t.topic);
      return true;
    },
    async deleteGroups(groupIds) {
      world.deletedGroups.push(...groupIds);
      return groupIds.map((groupId) => ({ groupId, errorCode: 0 }));
    },
  };
  const producer = {
    async send({ topic, messages }: { topic: string; messages: { key?: unknown; value: unknown }[] }): Promise<RecordMetadata[]> {
      assert.equal(topic, DIAGNOSTICS_TOPIC);
      world.sends += 1;
      const baseOffset = world.log.length;
      for (const m of messages) world.log.push({ key: String(m.key), value: String(m.value) });
      return [{ topicName: topic, partition: 0, errorCode: 0, baseOffset: String(baseOffset) }];
    },
  };
  const consumer = (groupId: string): KafkaProbeConsumer => {
    const state: KafkaWorld['consumers'][number] = { groupId, connected: false, disconnected: false };
    world.consumers.push(state);
    let handler: ((payload: EachMessagePayload) => Promise<void>) | undefined;
    return {
      async connect() {
        state.connected = true;
      },
      async subscribe() {},
      async run(config) {
        state.autoCommit = config?.autoCommit;
        handler = config?.eachMessage;
      },
      seek({ offset }) {
        if (!world.deliver) return;
        setTimeout(async () => {
          for (const [i, entry] of world.log.entries()) {
            if (i < Number(offset)) continue;
            const value = world.corruptPayload ? 'tampered' : entry.value;
            await handler?.({
              topic: DIAGNOSTICS_TOPIC,
              partition: 0,
              message: { key: Buffer.from(entry.key), value: Buffer.from(value), offset: String(i) },
            } as unknown as EachMessagePayload);
          }
        }, 5);
      },
      async disconnect() {
        state.disconnected = true;
      },
    };
  };
  return {
    admin: async () => admin,
    producer: async () => producer as never,
    consumer,
    probeId: 'probe-123',
    roundTripTimeoutMs: 100,
    ...extra,
  };
}

describe('Kafka probe', () => {
  it('passes with metadata, event topics, and a produce/consume round-trip', async () => {
    const world = kafkaWorld();
    const result = await runProbe(kafkaProbe(kafkaDeps(world)));
    assert.equal(result.status, 'pass', result.error ?? '');
    const text = result.details.join('\n');
    assert.match(text, /3 broker\(s\), controller 1, cluster aiven-test/);
    assert.match(text, /event topics present: orders\.placed, inventory\.updated/);
    assert.match(text, /produce -> consume round-trip \d+ ms \(retailsync\.diagnostics\[0\] @ 1\)/);
    assert.equal(world.created.length, 0);
  });

  it('uses a throwaway group that commits nothing and is cleaned up', async () => {
    const world = kafkaWorld();
    await runProbe(kafkaProbe(kafkaDeps(world)));
    assert.equal(world.consumers.length, 1);
    const [consumer] = world.consumers;
    assert.equal(consumer!.groupId, `${DIAGNOSTICS_GROUP_PREFIX}probe-123`);
    assert.equal(consumer!.autoCommit, false);
    assert.equal(consumer!.disconnected, true);
    assert.deepEqual(world.deletedGroups, [`${DIAGNOSTICS_GROUP_PREFIX}probe-123`]);
  });

  it('never produces probes to the event topics', async () => {
    const world = kafkaWorld();
    await runProbe(kafkaProbe(kafkaDeps(world)));
    // the fake producer asserts the topic; one send happened
    assert.equal(world.sends, 1);
  });

  it('creates the diagnostics topic on demand with 1 partition and RF capped at the broker count', async () => {
    const world = kafkaWorld({ brokers: 2, topics: new Set(['orders.placed', 'inventory.updated', 'retailsync-orders', 'retailsync-inventory']) });
    const result = await runProbe(kafkaProbe(kafkaDeps(world)));
    assert.equal(result.status, 'pass', result.error ?? '');
    assert.equal(world.created.length, 1);
    const [topic] = world.created;
    assert.equal(topic!.topic, DIAGNOSTICS_TOPIC);
    assert.equal(topic!.numPartitions, 1);
    assert.equal(topic!.replicationFactor, 2);
    assert.deepEqual(topic!.configEntries, [
      { name: 'cleanup.policy', value: 'delete' },
      { name: 'retention.ms', value: '3600000' },
    ]);
    assert.match(result.details.join('\n'), /created diagnostics topic/);
  });

  it('warns when the event topics are not provisioned', async () => {
    const world = kafkaWorld({ topics: new Set([DIAGNOSTICS_TOPIC]) });
    const result = await runProbe(kafkaProbe(kafkaDeps(world)));
    assert.equal(result.status, 'warn');
    assert.deepEqual(result.warnings, ['missing event topic(s): orders.placed, inventory.updated, retailsync-orders, retailsync-inventory - run: npm run kafka:topics']);
  });

  it('skips the round-trip with --no-roundtrip (read-only)', async () => {
    const world = kafkaWorld({ topics: new Set(['orders.placed', 'inventory.updated', 'retailsync-orders', 'retailsync-inventory']) });
    const result = await runProbe(kafkaProbe(kafkaDeps(world, { roundTrip: false })));
    assert.equal(result.status, 'pass');
    assert.equal(world.sends, 0);
    assert.equal(world.created.length, 0);
    assert.equal(world.consumers.length, 0);
    assert.match(result.details.join('\n'), /round-trip skipped/);
  });

  it('fails with an actionable hint when the diagnostics topic cannot be created', async () => {
    const world = kafkaWorld({
      topics: new Set(['orders.placed', 'inventory.updated', 'retailsync-orders', 'retailsync-inventory']),
      createError: Object.assign(new Error('Topic authorization failed'), { type: 'TOPIC_AUTHORIZATION_FAILED' }),
    });
    const result = await runProbe(kafkaProbe(kafkaDeps(world)));
    assert.equal(result.status, 'fail');
    assert.match(result.error!, /could not create diagnostics topic retailsync\.diagnostics: Topic authorization failed \[TOPIC_AUTHORIZATION_FAILED\]/);
    assert.match(result.error!, /--no-roundtrip/);
  });

  it('fails (and still cleans up) when the probe message never comes back', async () => {
    const world = kafkaWorld({ deliver: false });
    const result = await runProbe(kafkaProbe(kafkaDeps(world)));
    assert.equal(result.status, 'fail');
    assert.match(result.error!, /Kafka probe message consume timed out after 100 ms/);
    assert.equal(world.consumers[0]!.disconnected, true);
    assert.equal(world.deletedGroups.length, 1);
  });

  it('fails when the consumed payload differs from what was produced', async () => {
    const world = kafkaWorld({ corruptPayload: true });
    const result = await runProbe(kafkaProbe(kafkaDeps(world)));
    assert.equal(result.status, 'fail');
    assert.match(result.error!, /different payload/);
  });

  it('fails when the brokers are unreachable', async () => {
    const deps = kafkaDeps(kafkaWorld());
    deps.admin = async () => {
      throw Object.assign(new Error('Connection error: connect ECONNREFUSED'), { type: 'KafkaJSConnectionError' });
    };
    const result = await runProbe(kafkaProbe(deps));
    assert.equal(result.status, 'fail');
    assert.match(result.error!, /ECONNREFUSED/);
  });
});

// ---------------------------------------------------------------------------
// OpenSearch probe
// ---------------------------------------------------------------------------

function fakeOs(options: { status?: string; alias?: boolean; concrete?: boolean; docs?: number } = {}): OpenSearchProbeDeps {
  return {
    async check() {
      return { latencyMs: 40, clusterName: 'os-test', status: options.status ?? 'green', version: '2.19.1' };
    },
    async aliasExists() {
      return options.alias ?? true;
    },
    async aliasTargets() {
      return ['products_v1'];
    },
    async indexExists() {
      return options.concrete ?? false;
    },
    async count(index) {
      assert.equal(index, 'products');
      return options.docs ?? 60;
    },
  };
}

describe('OpenSearch probe', () => {
  it('passes on a green cluster with a populated products alias', async () => {
    const result = await runProbe(openSearchProbe(fakeOs()));
    assert.equal(result.status, 'pass');
    assert.match(result.details.join('\n'), /cluster os-test, OpenSearch 2\.19\.1, health green/);
    assert.match(result.details.join('\n'), /alias products -> products_v1: 60 document\(s\)/);
  });

  it('warns on yellow health', async () => {
    const result = await runProbe(openSearchProbe(fakeOs({ status: 'yellow' })));
    assert.equal(result.status, 'warn');
    assert.deepEqual(result.warnings, ['cluster health is yellow']);
  });

  it('fails on red health', async () => {
    const result = await runProbe(openSearchProbe(fakeOs({ status: 'red' })));
    assert.equal(result.status, 'fail');
    assert.match(result.error!, /RED/);
  });

  it('warns with the init command when the alias is missing', async () => {
    const result = await runProbe(openSearchProbe(fakeOs({ alias: false })));
    assert.equal(result.status, 'warn');
    assert.deepEqual(result.warnings, ['index alias "products" not found - run: npm run search:init']);
  });

  it('warns about an auto-created concrete products index', async () => {
    const result = await runProbe(openSearchProbe(fakeOs({ alias: false, concrete: true })));
    assert.equal(result.status, 'warn');
    assert.match(result.warnings[0]!, /concrete index.*--recreate/);
  });

  it('warns when the index is empty', async () => {
    const result = await runProbe(openSearchProbe(fakeOs({ docs: 0 })));
    assert.equal(result.status, 'warn');
    assert.deepEqual(result.warnings, ['products index is empty - run: npm run seed']);
  });
});

// ---------------------------------------------------------------------------
// Report + CLI args
// ---------------------------------------------------------------------------

const sample: ProbeResult[] = [
  { service: 'PostgreSQL', status: 'pass', latencyMs: 84, details: ['PostgreSQL 16.4', 'TLS: on'], warnings: [] },
  { service: 'Kafka', status: 'warn', latencyMs: 2310, details: ['3 broker(s)'], warnings: ['missing event topic(s)'] },
  { service: 'OpenSearch', status: 'fail', latencyMs: 20_000, details: [], warnings: [], error: 'OpenSearch timed out after 20000 ms' },
];

describe('report formatting', () => {
  it('formats latency in ms below one second and seconds above', () => {
    assert.equal(formatLatency(84), '84 ms');
    assert.equal(formatLatency(2310), '2.31 s');
  });

  it('renders an aligned plain-text table with every status, detail, warning, and error', () => {
    const text = formatReport(sample, { color: false });
    assert.doesNotMatch(text, ANSI_PATTERN);
    const lines = text.split('\n');
    assert.match(lines[0]!, /^ {2}SERVICE {5}STATUS {2}LATENCY {2}DETAILS$/);
    assert.match(text, /^ {2}PostgreSQL {2}PASS {6}84 ms {2}PostgreSQL 16\.4$/m);
    assert.match(text, /^ {2}Kafka {7}WARN {5}2\.31 s {2}3 broker\(s\)$/m);
    assert.match(text, /^ {2}OpenSearch {2}FAIL {4}20\.00 s {2}error: OpenSearch timed out after 20000 ms$/m);
    // continuation lines align under the DETAILS column
    const detailsColumn = lines[0]!.indexOf('DETAILS');
    const continuation = lines.find((line) => line.trim() === 'TLS: on')!;
    assert.equal(continuation.indexOf('TLS'), detailsColumn);
    const warning = lines.find((line) => line.includes('warning: missing event topic(s)'))!;
    assert.equal(warning.indexOf('warning'), detailsColumn);
    assert.equal(lines.at(-1), 'FAIL: 1 of 3 service(s) failed');
  });

  it('renders multi-line errors (one config issue per line) under the DETAILS column', () => {
    const lines = formatReport(
      [{ service: 'Kafka', status: 'fail', latencyMs: 3, details: [], warnings: [], error: 'configuration invalid:\n  A: is required\n  B: is required' }],
      { color: false },
    ).split('\n');
    const column = lines[0]!.indexOf('DETAILS');
    assert.equal(lines[1]!.slice(column), 'error: configuration invalid:');
    assert.equal(lines[2]!.slice(column), '         A: is required');
    assert.equal(lines[3]!.slice(column), '         B: is required');
  });

  it('colour-codes statuses when colour is enabled', () => {
    const text = formatReport(sample, { color: true });
    assert.ok(text.includes('\x1b[1m\x1b[32mPASS'));
    assert.ok(text.includes('\x1b[1m\x1b[33mWARN'));
    assert.ok(text.includes('\x1b[1m\x1b[31mFAIL'));
    // stripping colour yields exactly the plain report (alignment unaffected)
    assert.equal(text.replace(/\x1b\[[0-9;]*m/g, ''), formatReport(sample, { color: false }));
  });

  it('summarises all-pass and warning-only runs', () => {
    const passOnly = formatReport([sample[0]!], { color: false });
    assert.equal(passOnly.split('\n').at(-1), 'PASS: all 1 services reachable and ready');
    const withWarn = formatReport(sample.slice(0, 2), { color: false });
    assert.equal(withWarn.split('\n').at(-1), 'OK with warnings: 2/2 services reachable, 1 need setup');
  });

  it('decides colour from the TTY or FORCE_COLOR', () => {
    const tty = { isTTY: true, hasColors: () => true } as unknown as NodeJS.WriteStream;
    const pipe = { isTTY: false } as unknown as NodeJS.WriteStream;
    assert.equal(shouldColor(tty, {}), true);
    assert.equal(shouldColor(pipe, {}), false);
    assert.equal(shouldColor(pipe, { FORCE_COLOR: '1' }), true);
    assert.equal(shouldColor(pipe, { FORCE_COLOR: '0' }), false);
  });

  it('parses --no-roundtrip and rejects unknown flags', () => {
    assert.deepEqual(parseTestConnArgs([]), { roundTrip: true });
    assert.deepEqual(parseTestConnArgs(['--no-roundtrip']), { roundTrip: false });
    assert.throws(() => parseTestConnArgs(['--verbose']), /unknown argument\(s\): --verbose/);
  });
});
