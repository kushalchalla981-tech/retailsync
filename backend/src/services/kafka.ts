/**
 * Aiven for Apache Kafka connection singletons (KafkaJS).
 *
 * TLS: always on and verified against the Aiven project CA. Authentication is
 * either a client certificate (Aiven default, AIVEN_KAFKA_AUTH=ssl) or SASL
 * SCRAM/PLAIN over TLS (AIVEN_KAFKA_AUTH=sasl).
 */
import {
  Kafka,
  logLevel as KafkaLogLevel,
  Partitioners,
  type Admin,
  type Consumer,
  type ConsumerConfig,
  type KafkaConfig as KafkaJsConfig,
  type Producer,
  type SASLOptions,
} from 'kafkajs';

import { getKafkaConfig, getServerConfig, type KafkaConfig, type LogLevel } from '../config.js';

/** Map the app LOG_LEVEL onto KafkaJS levels (KafkaJS INFO is very chatty, so info -> WARN). */
export function toKafkaLogLevel(level: LogLevel): KafkaLogLevel {
  switch (level) {
    case 'silent':
      return KafkaLogLevel.NOTHING;
    case 'fatal':
    case 'error':
      return KafkaLogLevel.ERROR;
    case 'warn':
    case 'info':
      return KafkaLogLevel.WARN;
    case 'debug':
    case 'trace':
      return KafkaLogLevel.DEBUG;
  }
}

function toSasl(auth: Extract<KafkaConfig['auth'], { method: 'sasl' }>): SASLOptions {
  const { username, password } = auth;
  switch (auth.mechanism) {
    case 'plain':
      return { mechanism: 'plain', username, password };
    case 'scram-sha-256':
      return { mechanism: 'scram-sha-256', username, password };
    case 'scram-sha-512':
      return { mechanism: 'scram-sha-512', username, password };
  }
}

/** Build the KafkaJS client config for a validated config (pure, no I/O). */
export function buildKafkaClientConfig(config: KafkaConfig, level: KafkaLogLevel = KafkaLogLevel.WARN): KafkaJsConfig {
  const { auth } = config;
  return {
    clientId: config.clientId,
    brokers: config.brokers,
    ssl: {
      rejectUnauthorized: true,
      ca: [config.ca],
      ...(auth.method === 'ssl' ? { cert: auth.cert, key: auth.key } : {}),
    },
    ...(auth.method === 'sasl' ? { sasl: toSasl(auth) } : {}),
    connectionTimeout: 10_000,
    authenticationTimeout: 10_000,
    requestTimeout: 30_000,
    retry: { initialRetryTime: 300, retries: 8 },
    logLevel: level,
  };
}

let kafka: Kafka | undefined;
let producerPromise: Promise<Producer> | undefined;
let adminPromise: Promise<Admin> | undefined;
const consumers = new Set<Consumer>();

/** Process-wide KafkaJS client, created on first use from validated environment config. */
export function getKafka(): Kafka {
  return (kafka ??= new Kafka(buildKafkaClientConfig(getKafkaConfig(), toKafkaLogLevel(getServerConfig().logLevel))));
}

/** Memoise an async connect; a failed attempt is forgotten so the next call retries. */
function memoConnect<T extends { connect(): Promise<void> }>(
  current: Promise<T> | undefined,
  create: () => T,
  set: (value: Promise<T> | undefined) => void,
): Promise<T> {
  if (current) return current;
  const pending = (async () => {
    const instance = create();
    await instance.connect();
    return instance;
  })();
  set(pending);
  pending.catch(() => set(undefined));
  return pending;
}

/**
 * Shared, connected producer. Topics are provisioned explicitly (plan 01-02),
 * so automatic topic creation is disabled to surface typos as errors.
 */
export function getProducer(): Promise<Producer> {
  return memoConnect(
    producerPromise,
    () =>
      getKafka().producer({
        createPartitioner: Partitioners.DefaultPartitioner,
        allowAutoTopicCreation: false,
      }),
    (value) => {
      producerPromise = value;
    },
  );
}

/** Shared, connected admin client (topic provisioning, cluster metadata). */
export function getAdmin(): Promise<Admin> {
  return memoConnect(
    adminPromise,
    () => getKafka().admin(),
    (value) => {
      adminPromise = value;
    },
  );
}

/**
 * Create a consumer for `groupId`. The caller connects/subscribes/runs it;
 * it is tracked so `disconnectKafka()` can shut it down.
 */
export function createConsumer(groupId: string, overrides: Omit<ConsumerConfig, 'groupId'> = {}): Consumer {
  const consumer = getKafka().consumer({ allowAutoTopicCreation: false, ...overrides, groupId });
  consumers.add(consumer);
  return consumer;
}

export interface KafkaHealth {
  latencyMs: number;
  clusterId: string;
  brokerCount: number;
  controller: number | null;
}

/** Metadata round-trip: proves TLS, authentication, and broker reachability. */
export async function checkKafka(): Promise<KafkaHealth> {
  const started = performance.now();
  const admin = await getAdmin();
  const cluster = await admin.describeCluster();
  return {
    latencyMs: Math.round(performance.now() - started),
    clusterId: cluster.clusterId,
    brokerCount: cluster.brokers.length,
    controller: cluster.controller,
  };
}

/** Disconnect producer, admin, and all tracked consumers (idempotent, best effort). */
export async function disconnectKafka(): Promise<void> {
  const tasks: Promise<void>[] = [];
  for (const consumer of consumers) tasks.push(consumer.disconnect());
  consumers.clear();

  const producer = producerPromise;
  const admin = adminPromise;
  producerPromise = undefined;
  adminPromise = undefined;
  if (producer) tasks.push(producer.then((p) => p.disconnect()));
  if (admin) tasks.push(admin.then((a) => a.disconnect()));

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(`[kafka] disconnect error: ${(result.reason as Error)?.message ?? String(result.reason)}`);
    }
  }
  kafka = undefined;
}
