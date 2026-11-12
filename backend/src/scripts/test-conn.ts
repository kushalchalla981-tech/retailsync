/**
 * Unified connectivity diagnostics for the three Aiven services.
 *
 * Probes PostgreSQL, Apache Kafka, and OpenSearch in parallel and prints a
 * colour-coded PASS / WARN / FAIL table with per-service latency:
 *
 *   - PostgreSQL: query round-trip (server version + TLS state from
 *     pg_stat_ssl), then schema/catalog status (migrations applied, rows seeded).
 *   - Kafka: cluster metadata (brokers, controller), presence of the event
 *     topics, and a produce -> consume round-trip of a unique probe message on
 *     the dedicated `retailsync.diagnostics` topic (created on demand with 1h
 *     retention, so probes never pollute `orders.placed` / `inventory.updated`).
 *   - OpenSearch: cluster info + health, `products` alias target and document count.
 *
 * Status meaning:
 *   PASS  service reachable, authenticated, and fully set up
 *   WARN  service reachable, but setup is incomplete (e.g. not migrated / not
 *         seeded / cluster yellow) - each warning names the command to run
 *   FAIL  unreachable, rejected credentials, misconfigured, or timed out
 *
 * Exit code: 0 when no service FAILs, 1 otherwise. A service whose
 * configuration is invalid fails on its own; the other services are still probed.
 *
 * Usage:  npm run test:conn [-- --no-roundtrip]
 */
import { randomUUID } from 'node:crypto';

import { Kafka, Partitioners, type Admin, type Consumer, type Producer } from 'kafkajs';

import { errorMessage, isMainModule } from '../cli.js';
import { ConfigError, getKafkaConfig, getServerConfig, loadDotEnv } from '../config.js';
import { describeKafkaError, resolveReplicationFactor, TOPICS } from '../kafka/topics.js';
import { openSearchIndexAdmin, PRODUCTS_ALIAS } from '../search/mappings.js';
import { buildKafkaClientConfig, toKafkaLogLevel } from '../services/kafka.js';
import { checkOpenSearch, closeOpenSearch, getOpenSearch, type OpenSearchHealth } from '../services/opensearch.js';
import { checkPostgres, closePgPool, query, type PostgresHealth } from '../services/postgres.js';

// ---------------------------------------------------------------------------
// Probe model
// ---------------------------------------------------------------------------

export type ProbeStatus = 'pass' | 'warn' | 'fail';

/** What a successful probe reports: informational lines plus setup warnings. */
export interface ProbeReport {
  details: string[];
  warnings: string[];
}

export interface Probe {
  service: string;
  timeoutMs: number;
  run(): Promise<ProbeReport>;
}

export interface ProbeResult {
  service: string;
  status: ProbeStatus;
  latencyMs: number;
  details: string[];
  warnings: string[];
  error?: string;
}

export class ProbeTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms} ms`);
    this.name = 'ProbeTimeoutError';
  }
}

/** Reject with ProbeTimeoutError if `promise` has not settled within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProbeTimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Failure description; configuration errors list one variable issue per line
 * (names and requirements only - ConfigError never carries values).
 */
export function describeProbeError(error: unknown): string {
  if (error instanceof ConfigError) return ['configuration invalid:', ...error.issues.map((issue) => `  ${issue}`)].join('\n');
  return describeKafkaError(error);
}

/** Run one probe; never throws - failures and timeouts become a `fail` result. */
export async function runProbe(probe: Probe, now: () => number = () => performance.now()): Promise<ProbeResult> {
  const started = now();
  try {
    const report = await withTimeout(Promise.resolve().then(() => probe.run()), probe.timeoutMs, probe.service);
    return {
      service: probe.service,
      status: report.warnings.length > 0 ? 'warn' : 'pass',
      latencyMs: Math.round(now() - started),
      details: report.details,
      warnings: report.warnings,
    };
  } catch (error) {
    return {
      service: probe.service,
      status: 'fail',
      latencyMs: Math.round(now() - started),
      details: [],
      warnings: [],
      error: describeProbeError(error),
    };
  }
}

/** Run all probes concurrently; results keep the probe order. */
export function runDiagnostics(probes: readonly Probe[]): Promise<ProbeResult[]> {
  return Promise.all(probes.map((probe) => runProbe(probe)));
}

export function exitCodeFor(results: readonly ProbeResult[]): 0 | 1 {
  return results.some((result) => result.status === 'fail') ? 1 : 0;
}

// ---------------------------------------------------------------------------
// PostgreSQL probe
// ---------------------------------------------------------------------------

export interface PostgresProbeDeps {
  check(): Promise<PostgresHealth>;
  query<R extends Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: R[] }>;
}

export const SCHEMA_PRESENCE_SQL = `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS migrations_table,
       to_regclass('public.products') IS NOT NULL AS products_table`;

export const CATALOG_COUNTS_SQL = `SELECT (SELECT count(*) FROM schema_migrations)::int AS migrations,
       (SELECT count(*) FROM products)::int AS products,
       (SELECT count(*) FROM store_locations)::int AS locations,
       (SELECT count(*) FROM inventory)::int AS inventory_rows`;

export function postgresProbe(deps: PostgresProbeDeps, timeoutMs = 20_000): Probe {
  return {
    service: 'PostgreSQL',
    timeoutMs,
    async run() {
      const details: string[] = [];
      const warnings: string[] = [];

      const health = await deps.check();
      details.push(`PostgreSQL ${health.serverVersion}, query round-trip ${health.latencyMs} ms`);
      if (health.ssl) {
        details.push('TLS: on (pg_stat_ssl)');
      } else {
        warnings.push('pg_stat_ssl does not report TLS for this connection');
      }

      const presence = (await deps.query<{ migrations_table: boolean; products_table: boolean }>(SCHEMA_PRESENCE_SQL)).rows[0];
      if (!presence?.migrations_table || !presence.products_table) {
        warnings.push('schema not migrated - run: npm run db:migrate');
        return { details, warnings };
      }

      const counts = (
        await deps.query<{ migrations: number; products: number; locations: number; inventory_rows: number }>(CATALOG_COUNTS_SQL)
      ).rows[0];
      details.push(
        `schema: ${counts?.migrations ?? 0} migration(s) applied; catalog: ${counts?.products ?? 0} products, ` +
          `${counts?.locations ?? 0} store locations, ${counts?.inventory_rows ?? 0} inventory rows`,
      );
      if (!counts || counts.products === 0) warnings.push('catalog is empty - run: npm run seed');
      return { details, warnings };
    },
  };
}

// ---------------------------------------------------------------------------
// Kafka probe
// ---------------------------------------------------------------------------

/** Dedicated topic for round-trip probes (keeps diagnostics out of the event topics). */
export const DIAGNOSTICS_TOPIC = 'retailsync.diagnostics';
export const DIAGNOSTICS_RETENTION_MS = 60 * 60 * 1000;
export const DIAGNOSTICS_GROUP_PREFIX = 'retailsync-test-conn-';

export type KafkaProbeAdmin = Pick<Admin, 'describeCluster' | 'listTopics' | 'createTopics' | 'deleteGroups'>;
export type KafkaProbeProducer = Pick<Producer, 'send'>;
export type KafkaProbeConsumer = Pick<Consumer, 'connect' | 'subscribe' | 'run' | 'seek' | 'disconnect'>;

export interface KafkaProbeDeps {
  admin(): Promise<KafkaProbeAdmin>;
  producer(): Promise<KafkaProbeProducer>;
  consumer(groupId: string): KafkaProbeConsumer;
  /** Produce/consume a probe message (default true). */
  roundTrip?: boolean;
  /** Unique id for the probe message and its throwaway consumer group. */
  probeId?: string;
  /** Max wait for the probe message to come back (default 30 s). */
  roundTripTimeoutMs?: number;
  now?: () => number;
}

/** The diagnostics topic: 1 partition (seek target is unambiguous), short retention. */
export function diagnosticsTopicConfig(brokerCount: number) {
  return {
    topic: DIAGNOSTICS_TOPIC,
    numPartitions: 1,
    replicationFactor: resolveReplicationFactor(brokerCount),
    configEntries: [
      { name: 'cleanup.policy', value: 'delete' },
      { name: 'retention.ms', value: String(DIAGNOSTICS_RETENTION_MS) },
    ],
  };
}

/**
 * Produce one uniquely keyed message, then read it back with a throwaway
 * consumer group that seeks straight to the produced offset (no dependence on
 * offset-reset timing, no committed offsets). Returns the round-trip in ms.
 */
export async function kafkaRoundTrip(
  deps: Required<Pick<KafkaProbeDeps, 'producer' | 'consumer'>> & { admin: KafkaProbeAdmin },
  probeId: string,
  timeoutMs: number,
  now: () => number,
): Promise<{ roundTripMs: number; partition: number; offset: string }> {
  const payload = JSON.stringify({ probe_id: probeId, source: 'test:conn', sent_at: new Date().toISOString() });
  const producer = await deps.producer();
  const started = now();
  const [meta] = await producer.send({ topic: DIAGNOSTICS_TOPIC, acks: -1, messages: [{ key: probeId, value: payload }] });
  const offset = meta?.baseOffset ?? meta?.offset;
  if (!meta || offset === undefined) throw new Error('producer returned no offset for the probe message');

  const groupId = `${DIAGNOSTICS_GROUP_PREFIX}${probeId}`;
  const consumer = deps.consumer(groupId);
  try {
    await consumer.connect();
    await consumer.subscribe({ topics: [DIAGNOSTICS_TOPIC], fromBeginning: false });
    let resolveReceived!: () => void;
    let rejectReceived!: (error: Error) => void;
    const received = new Promise<void>((resolve, reject) => {
      resolveReceived = resolve;
      rejectReceived = reject;
    });
    await consumer.run({
      autoCommit: false,
      eachMessage: async ({ message }) => {
        if (message.key?.toString() !== probeId) return;
        if (message.value?.toString() !== payload) {
          rejectReceived(new Error('probe message came back with a different payload'));
          return;
        }
        resolveReceived();
      },
    });
    consumer.seek({ topic: DIAGNOSTICS_TOPIC, partition: meta.partition, offset });
    await withTimeout(received, timeoutMs, 'Kafka probe message consume');
    return { roundTripMs: Math.round(now() - started), partition: meta.partition, offset };
  } finally {
    await consumer.disconnect().catch(() => undefined);
    // The group never commits offsets; deleting it is housekeeping only.
    await deps.admin.deleteGroups([groupId]).catch(() => undefined);
  }
}

export function kafkaProbe(deps: KafkaProbeDeps, timeoutMs = 60_000): Probe {
  const now = deps.now ?? (() => performance.now());
  return {
    service: 'Kafka',
    timeoutMs,
    async run() {
      const details: string[] = [];
      const warnings: string[] = [];

      const started = now();
      const admin = await deps.admin();
      const cluster = await admin.describeCluster();
      details.push(
        `${cluster.brokers.length} broker(s), controller ${cluster.controller ?? 'unknown'}, cluster ${cluster.clusterId}; ` +
          `metadata ${Math.round(now() - started)} ms`,
      );

      const topics = new Set(await admin.listTopics());
      const eventTopics = Object.values(TOPICS);
      const missing = eventTopics.filter((topic) => !topics.has(topic));
      if (missing.length === 0) {
        details.push(`event topics present: ${eventTopics.join(', ')}`);
      } else {
        warnings.push(`missing event topic(s): ${missing.join(', ')} - run: npm run kafka:topics`);
      }

      if (deps.roundTrip === false) {
        details.push('produce/consume round-trip skipped (--no-roundtrip)');
        return { details, warnings };
      }

      if (!topics.has(DIAGNOSTICS_TOPIC)) {
        try {
          await admin.createTopics({ topics: [diagnosticsTopicConfig(cluster.brokers.length)], waitForLeaders: true, timeout: 30_000 });
        } catch (error) {
          throw new Error(
            `could not create diagnostics topic ${DIAGNOSTICS_TOPIC}: ${describeKafkaError(error)}. ` +
              'Create it in the Aiven Console (1 partition) or re-run with --no-roundtrip.',
            { cause: error },
          );
        }
        details.push(`created diagnostics topic ${DIAGNOSTICS_TOPIC} (1 partition, 1h retention)`);
      }

      const probeId = deps.probeId ?? randomUUID();
      const trip = await kafkaRoundTrip(
        { admin, producer: deps.producer, consumer: deps.consumer },
        probeId,
        deps.roundTripTimeoutMs ?? 30_000,
        now,
      );
      details.push(`produce -> consume round-trip ${trip.roundTripMs} ms (${DIAGNOSTICS_TOPIC}[${trip.partition}] @ ${trip.offset})`);
      return { details, warnings };
    },
  };
}

// ---------------------------------------------------------------------------
// OpenSearch probe
// ---------------------------------------------------------------------------

export interface OpenSearchProbeDeps {
  check(): Promise<OpenSearchHealth>;
  aliasExists(alias: string): Promise<boolean>;
  aliasTargets(alias: string): Promise<string[]>;
  indexExists(index: string): Promise<boolean>;
  count(index: string): Promise<number>;
}

export function openSearchProbe(deps: OpenSearchProbeDeps, timeoutMs = 20_000): Probe {
  return {
    service: 'OpenSearch',
    timeoutMs,
    async run() {
      const details: string[] = [];
      const warnings: string[] = [];

      const health = await deps.check();
      if (health.status === 'red') {
        throw new Error(`cluster ${health.clusterName} health is RED (some primary shards are unassigned)`);
      }
      details.push(`cluster ${health.clusterName}, OpenSearch ${health.version}, health ${health.status}, round-trip ${health.latencyMs} ms`);
      if (health.status !== 'green') warnings.push(`cluster health is ${health.status}`);

      if (!(await deps.aliasExists(PRODUCTS_ALIAS))) {
        if (await deps.indexExists(PRODUCTS_ALIAS)) {
          warnings.push(`"${PRODUCTS_ALIAS}" is a concrete index, not the alias - run: npm run search:init -- --recreate, then npm run seed`);
        } else {
          warnings.push(`index alias "${PRODUCTS_ALIAS}" not found - run: npm run search:init`);
        }
        return { details, warnings };
      }

      const targets = await deps.aliasTargets(PRODUCTS_ALIAS);
      const documents = await deps.count(PRODUCTS_ALIAS);
      details.push(`alias ${PRODUCTS_ALIAS} -> ${targets.join(', ') || '(none)'}: ${documents} document(s)`);
      if (documents === 0) warnings.push('products index is empty - run: npm run seed');
      return { details, warnings };
    },
  };
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

const ANSI = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m' } as const;

const STATUS_STYLE: Record<ProbeStatus, { label: string; color: string }> = {
  pass: { label: 'PASS', color: ANSI.green },
  warn: { label: 'WARN', color: ANSI.yellow },
  fail: { label: 'FAIL', color: ANSI.red },
};

export function formatLatency(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export interface FormatOptions {
  color: boolean;
}

/** Render the results table. Columns are padded before colouring so ANSI codes never break alignment. */
export function formatReport(results: readonly ProbeResult[], options: FormatOptions): string {
  const paint = (text: string, ...codes: string[]) => (options.color ? `${codes.join('')}${text}${ANSI.reset}` : text);
  const serviceWidth = Math.max('SERVICE'.length, ...results.map((r) => r.service.length));
  const latencyWidth = Math.max('LATENCY'.length, ...results.map((r) => formatLatency(r.latencyMs).length));
  const statusWidth = 'STATUS'.length;
  const indent = ' '.repeat(2 + serviceWidth + 2 + statusWidth + 2 + latencyWidth + 2);

  const lines = [
    paint(`  ${'SERVICE'.padEnd(serviceWidth)}  ${'STATUS'.padEnd(statusWidth)}  ${'LATENCY'.padStart(latencyWidth)}  DETAILS`, ANSI.bold),
  ];
  for (const result of results) {
    const style = STATUS_STYLE[result.status];
    const notes = [
      ...result.details.map((text) => ({ text, codes: [] as string[] })),
      ...result.warnings.map((text) => ({ text: `warning: ${text}`, codes: [ANSI.yellow] })),
      ...(result.error ? result.error.split('\n').map((line, i) => ({ text: i === 0 ? `error: ${line}` : `       ${line}`, codes: [ANSI.red] })) : []),
    ];
    const [first, ...rest] = notes;
    lines.push(
      `  ${result.service.padEnd(serviceWidth)}  ${paint(style.label.padEnd(statusWidth), ANSI.bold, style.color)}  ` +
        `${formatLatency(result.latencyMs).padStart(latencyWidth)}  ${first ? paint(first.text, ...first.codes) : ''}`.trimEnd(),
    );
    for (const note of rest) lines.push(`${indent}${paint(note.text, ...note.codes)}`);
  }

  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const result of results) counts[result.status] += 1;
  const reachable = counts.pass + counts.warn;
  const summary =
    counts.fail > 0
      ? paint(`FAIL: ${counts.fail} of ${results.length} service(s) failed`, ANSI.bold, ANSI.red)
      : counts.warn > 0
        ? paint(`OK with warnings: ${reachable}/${results.length} services reachable, ${counts.warn} need setup`, ANSI.bold, ANSI.yellow)
        : paint(`PASS: all ${results.length} services reachable and ready`, ANSI.bold, ANSI.green);
  lines.push('', summary);
  return lines.join('\n');
}

/** Colour when stdout is a colour-capable TTY (honours NO_COLOR / FORCE_COLOR). */
export function shouldColor(stream: NodeJS.WriteStream = process.stdout, env: NodeJS.ProcessEnv = process.env): boolean {
  if (stream.isTTY) return stream.hasColors();
  return env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0' && env.FORCE_COLOR !== 'false';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface TestConnOptions {
  roundTrip: boolean;
}

export function parseTestConnArgs(args: readonly string[]): TestConnOptions {
  const unknown = args.filter((arg) => arg !== '--no-roundtrip');
  if (unknown.length > 0) throw new Error(`unknown argument(s): ${unknown.join(' ')} (supported: --no-roundtrip)`);
  return { roundTrip: !args.includes('--no-roundtrip') };
}

/**
 * Kafka clients for one diagnostics run. Same TLS/auth config as the app's
 * shared client, but with a short retry budget so an unreachable broker or a
 * rejected certificate surfaces its real error in seconds instead of hiding
 * behind the probe timeout (the app client retries 8 times, ~60 s).
 */
export class KafkaDiagnosticsSession {
  static readonly RETRIES = 2;
  private kafka: Kafka | undefined;
  private admin: Promise<Admin> | undefined;
  private producer: Promise<Producer> | undefined;
  private readonly consumers = new Set<Consumer>();

  private client(): Kafka {
    return (this.kafka ??= new Kafka({
      ...buildKafkaClientConfig(getKafkaConfig(), toKafkaLogLevel(getServerConfig().logLevel)),
      retry: { initialRetryTime: 300, retries: KafkaDiagnosticsSession.RETRIES },
    }));
  }

  getAdmin = (): Promise<Admin> =>
    (this.admin ??= (async () => {
      const admin = this.client().admin();
      await admin.connect();
      return admin;
    })());

  getProducer = (): Promise<Producer> =>
    (this.producer ??= (async () => {
      const producer = this.client().producer({ allowAutoTopicCreation: false, createPartitioner: Partitioners.DefaultPartitioner });
      await producer.connect();
      return producer;
    })());

  createConsumer = (groupId: string): Consumer => {
    const consumer = this.client().consumer({ groupId, allowAutoTopicCreation: false, maxWaitTimeInMs: 500 });
    this.consumers.add(consumer);
    return consumer;
  };

  async close(): Promise<void> {
    const pending: Promise<unknown>[] = [...this.consumers].map((consumer) => consumer.disconnect());
    if (this.producer) pending.push(this.producer.then((producer) => producer.disconnect()));
    if (this.admin) pending.push(this.admin.then((admin) => admin.disconnect()));
    this.consumers.clear();
    this.admin = this.producer = undefined;
    this.kafka = undefined;
    // A client whose connect already failed has nothing to close.
    await Promise.allSettled(pending);
  }
}

/** Probes wired to the real services (PostgreSQL / OpenSearch singletons, a dedicated Kafka session). */
export function liveProbes(options: TestConnOptions, kafka: KafkaDiagnosticsSession): Probe[] {
  return [
    postgresProbe({ check: checkPostgres, query: (text, values) => query(text, values) }),
    kafkaProbe({ admin: kafka.getAdmin, producer: kafka.getProducer, consumer: kafka.createConsumer, roundTrip: options.roundTrip }),
    openSearchProbe({
      check: checkOpenSearch,
      aliasExists: (alias) => openSearchIndexAdmin(getOpenSearch()).aliasExists(alias),
      aliasTargets: (alias) => openSearchIndexAdmin(getOpenSearch()).aliasTargets(alias),
      indexExists: (index) => openSearchIndexAdmin(getOpenSearch()).indexExists(index),
      count: async (index) => (await getOpenSearch().count({ index })).body.count,
    }),
  ];
}

const CLEANUP_TIMEOUT_MS = 5_000;

async function main(): Promise<number> {
  let options: TestConnOptions;
  try {
    options = parseTestConnArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[test:conn] ${errorMessage(error)}`);
    return 1;
  }

  const envFile = loadDotEnv();
  console.log('RetailSync connectivity diagnostics (Aiven PostgreSQL, Kafka, OpenSearch)');
  console.log(`env: ${envFile ?? 'no .env file found - using process environment only'}\n`);

  const kafka = new KafkaDiagnosticsSession();
  const results = await runDiagnostics(liveProbes(options, kafka));
  console.log(formatReport(results, { color: shouldColor() }));

  // Close everything, but never let a stuck client (e.g. KafkaJS still
  // retrying an unreachable broker) hold the report hostage.
  const cleanup = await Promise.allSettled(
    [closePgPool(), kafka.close(), closeOpenSearch()].map((task) => withTimeout(task, CLEANUP_TIMEOUT_MS, 'cleanup')),
  );
  for (const outcome of cleanup) {
    if (outcome.status === 'rejected') console.error(`[test:conn] cleanup: ${errorMessage(outcome.reason)}`);
  }
  return exitCodeFor(results);
}

if (isMainModule(import.meta.url)) {
  process.exitCode = await main();
  // Pending client retry timers must not keep the process alive after the report.
  setTimeout(() => process.exit(), 0).unref();
}
