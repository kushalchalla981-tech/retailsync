/**
 * Kafka topic provisioning for Aiven for Apache Kafka.
 *
 * Ensures the event topics exist with the expected partitioning and
 * replication. The shared producer is created with `allowAutoTopicCreation:
 * false` (services/kafka.ts), so these topics MUST be provisioned before
 * Phase 3 publishes anything - a typo'd topic name then fails loudly instead
 * of silently creating a new topic.
 *
 * Existing topics are never altered: increasing partitions remaps message
 * keys to different partitions and breaks per-key ordering, so drift is
 * reported as a warning for an operator to decide on.
 *
 * Usage:  npm run kafka:topics --workspace backend [-- --partitions N --replication-factor N]
 */
import type { Admin, ITopicConfig } from 'kafkajs';

import { errorMessage, isMainModule, runCli } from '../cli.js';
import { getKafkaConfig } from '../config.js';
import { disconnectKafka, getAdmin } from '../services/kafka.js';

export const TOPICS = {
  /** Emitted after an order commits in PostgreSQL. Key: order id (UUID). */
  ORDERS_PLACED: 'orders.placed',
  /** Emitted with new per-location stock after a change. Key: product id, so one product's updates stay ordered. */
  INVENTORY_UPDATED: 'inventory.updated',
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface TopicSpec {
  topic: TopicName;
  numPartitions: number;
  configEntries: Readonly<Record<string, string>>;
}

export const DEFAULT_PARTITIONS = 3;
/** Target replication factor; capped at the broker count (see resolveReplicationFactor). */
export const DESIRED_REPLICATION_FACTOR = 3;

export const TOPIC_SPECS: readonly TopicSpec[] = [
  {
    topic: TOPICS.ORDERS_PLACED,
    numPartitions: DEFAULT_PARTITIONS,
    configEntries: { 'cleanup.policy': 'delete', 'retention.ms': String(SEVEN_DAYS_MS) },
  },
  {
    topic: TOPICS.INVENTORY_UPDATED,
    numPartitions: DEFAULT_PARTITIONS,
    configEntries: { 'cleanup.policy': 'delete', 'retention.ms': String(SEVEN_DAYS_MS) },
  },
];

/** Replicate to as many brokers as available, up to the desired factor. */
export function resolveReplicationFactor(brokerCount: number, desired = DESIRED_REPLICATION_FACTOR): number {
  if (!Number.isInteger(brokerCount) || brokerCount < 1) {
    throw new Error(`cluster reported ${brokerCount} brokers; cannot provision topics`);
  }
  return Math.min(desired, brokerCount);
}

/** Tolerate one replica down while still requiring a durable (acks=all) write on >= 2 replicas. */
export function minInsyncReplicas(replicationFactor: number): number {
  return replicationFactor >= 3 ? 2 : 1;
}

export interface ProvisionOptions {
  /** Override partitions for newly created topics (e.g. plan limits). */
  partitions?: number;
  /** Override the replication factor (must not exceed the broker count). */
  replicationFactor?: number;
}

/** KafkaJS CreateTopics request entries for the given specs (pure). */
export function buildTopicConfigs(
  specs: readonly TopicSpec[],
  replicationFactor: number,
  partitions?: number,
): ITopicConfig[] {
  return specs.map((spec) => ({
    topic: spec.topic,
    numPartitions: partitions ?? spec.numPartitions,
    replicationFactor,
    configEntries: Object.entries({
      ...spec.configEntries,
      'min.insync.replicas': String(minInsyncReplicas(replicationFactor)),
    }).map(([name, value]) => ({ name, value })),
  }));
}

export type TopicAdmin = Pick<Admin, 'describeCluster' | 'listTopics' | 'createTopics' | 'fetchTopicMetadata'>;

export interface TopicStatus {
  topic: string;
  status: 'created' | 'exists';
  partitions: number;
  replicationFactor: number;
  warnings: string[];
}

export interface ProvisionResult {
  brokerCount: number;
  replicationFactor: number;
  topics: TopicStatus[];
}

/**
 * KafkaJS reports per-topic CreateTopics failures as a KafkaJSAggregateError
 * whose own message is generic; include each inner error's type and message.
 */
export function describeKafkaError(error: unknown): string {
  const inner = (error as { errors?: unknown }).errors;
  if (Array.isArray(inner) && inner.length > 0) {
    const details = inner.map((e: { type?: string; message?: string }) =>
      [e.type, e.message].filter(Boolean).join(': '),
    );
    return `${errorMessage(error)} (${details.join('; ')})`;
  }
  const type = (error as { type?: string }).type;
  return type ? `${errorMessage(error)} [${type}]` : errorMessage(error);
}

const AUTH_HINT =
  'The Kafka user may lack permission to create topics. Create the topics in the Aiven Console ' +
  '(Topics -> Add topic) with the same names, then re-run this script to verify them.';

/** Create missing topics, then verify every topic from live metadata. Idempotent. */
export async function ensureTopics(
  admin: TopicAdmin,
  options: ProvisionOptions = {},
  specs: readonly TopicSpec[] = TOPIC_SPECS,
): Promise<ProvisionResult> {
  for (const [name, value] of Object.entries(options)) {
    if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
      throw new Error(`${name} must be a positive integer`);
    }
  }

  const cluster = await admin.describeCluster();
  const brokerCount = cluster.brokers.length;
  const replicationFactor = options.replicationFactor ?? resolveReplicationFactor(brokerCount);
  if (replicationFactor > brokerCount) {
    throw new Error(`replication factor ${replicationFactor} exceeds the ${brokerCount} available broker(s)`);
  }

  const existing = new Set(await admin.listTopics());
  const missing = specs.filter((spec) => !existing.has(spec.topic));
  if (missing.length > 0) {
    try {
      await admin.createTopics({
        topics: buildTopicConfigs(missing, replicationFactor, options.partitions),
        waitForLeaders: true,
        timeout: 30_000,
      });
    } catch (error) {
      const message = describeKafkaError(error);
      const hint = /authori[sz]|policy|not allowed|denied/i.test(message) ? ` ${AUTH_HINT}` : '';
      throw new Error(`creating topics ${missing.map((s) => s.topic).join(', ')} failed: ${message}.${hint}`, { cause: error });
    }
  }

  const metadata = await admin.fetchTopicMetadata({ topics: specs.map((spec) => spec.topic) });
  const byName = new Map(metadata.topics.map((topic) => [topic.name, topic]));

  const topics = specs.map((spec): TopicStatus => {
    const meta = byName.get(spec.topic);
    if (!meta || meta.partitions.length === 0) {
      throw new Error(`topic ${spec.topic} is missing from cluster metadata after provisioning`);
    }
    const partitions = meta.partitions.length;
    const actualRf = Math.min(...meta.partitions.map((p) => p.replicas.length));
    const expectedPartitions = options.partitions ?? spec.numPartitions;
    const warnings: string[] = [];
    if (partitions !== expectedPartitions) {
      warnings.push(
        `has ${partitions} partition(s), expected ${expectedPartitions} (left unchanged: repartitioning breaks per-key ordering)`,
      );
    }
    if (actualRf < replicationFactor) {
      warnings.push(`replication factor ${actualRf} is below the expected ${replicationFactor}`);
    }
    const offline = meta.partitions.filter((p) => p.leader < 0).length;
    if (offline > 0) warnings.push(`${offline} partition(s) have no leader`);
    return {
      topic: spec.topic,
      status: existing.has(spec.topic) ? 'exists' : 'created',
      partitions,
      replicationFactor: actualRf,
      warnings,
    };
  });

  return { brokerCount, replicationFactor, topics };
}

/** Parse `--partitions N` / `--replication-factor N` (also `--flag=N`). */
export function parseProvisionArgs(args: readonly string[]): ProvisionOptions {
  const options: ProvisionOptions = {};
  const flags = { '--partitions': 'partitions', '--replication-factor': 'replicationFactor' } as const;
  for (let i = 0; i < args.length; i += 1) {
    const [flag, inline] = args[i]!.split('=', 2) as [string, string | undefined];
    if (!(flag in flags)) throw new Error(`unknown argument ${flag} (supported: --partitions N, --replication-factor N)`);
    const raw = inline ?? args[(i += 1)];
    const value = Number(raw);
    if (raw === undefined || !Number.isInteger(value) || value < 1) throw new Error(`${flag} needs a positive integer`);
    options[flags[flag as keyof typeof flags]] = value;
  }
  return options;
}

async function main(args: readonly string[]): Promise<void> {
  const options = parseProvisionArgs(args);
  const config = getKafkaConfig();
  console.log(`[kafka:topics] target ${config.brokers.join(', ')} (auth: ${config.auth.method})`);
  const result = await ensureTopics(await getAdmin(), options);
  console.log(`[kafka:topics] ${result.brokerCount} broker(s); replication factor ${result.replicationFactor}`);
  for (const topic of result.topics) {
    console.log(
      `[kafka:topics] ${topic.status.padEnd(7)} ${topic.topic} (partitions ${topic.partitions}, replication ${topic.replicationFactor})`,
    );
    for (const warning of topic.warnings) console.warn(`[kafka:topics] WARNING: ${topic.topic} ${warning}`);
  }
}

if (isMainModule(import.meta.url)) {
  await runCli('kafka:topics', main, disconnectKafka);
}
