/**
 * Hermetic tests for the service singletons: option builders, TLS settings,
 * and singleton lifecycle. No network connections are opened (pg pools and
 * the KafkaJS / OpenSearch clients connect lazily).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { logLevel as KafkaLogLevel } from 'kafkajs';
import pg from 'pg';

import { loadKafkaConfig, loadOpenSearchConfig, loadPostgresConfig, resetConfigCache } from '../config.js';
import { buildKafkaClientConfig, disconnectKafka, getKafka, toKafkaLogLevel } from './kafka.js';
import { buildOpenSearchClientOptions, closeOpenSearch, getOpenSearch } from './opensearch.js';
import { buildPgPoolConfig, closePgPool, getPgPool } from './postgres.js';

const CA = '-----BEGIN CERTIFICATE-----\nMIIBshared-ca\n-----END CERTIFICATE-----\n';
const CERT = '-----BEGIN CERTIFICATE-----\nMIIBclient-cert\n-----END CERTIFICATE-----\n';
const KEY = '-----BEGIN PRIVATE KEY-----\nMIIEclient-key\n-----END PRIVATE KEY-----\n';

const dir = mkdtempSync(join(tmpdir(), 'retailsync-services-test-'));
writeFileSync(join(dir, 'ca.pem'), CA);
writeFileSync(join(dir, 'service.cert'), CERT);
writeFileSync(join(dir, 'service.key'), KEY);

const env = {
  AIVEN_CA_CERT_PATH: join(dir, 'ca.pem'),
  AIVEN_PG_URI: 'postgres://avnadmin:pw@pg-demo.aivencloud.com:12345/defaultdb?sslmode=require',
  AIVEN_KAFKA_BROKERS: 'kafka-demo.aivencloud.com:12346',
  AIVEN_KAFKA_ACCESS_CERT_PATH: join(dir, 'service.cert'),
  AIVEN_KAFKA_ACCESS_KEY_PATH: join(dir, 'service.key'),
  AIVEN_OPENSEARCH_URI: 'https://avnadmin:pw@os-demo.aivencloud.com:12347',
};

/** pg's internal resolved parameters (connection string merged with options). */
function resolvedSsl(config: pg.ClientConfig): unknown {
  const client = new pg.Client(config) as unknown as { connectionParameters: { ssl: unknown } };
  return client.connectionParameters.ssl;
}

describe('postgres service', () => {
  it('keeps the CA-pinned ssl object after pg merges the connection string', () => {
    const poolConfig = buildPgPoolConfig(loadPostgresConfig(env));
    assert.deepEqual(resolvedSsl(poolConfig), { ca: CA, rejectUnauthorized: true });
    assert.equal(poolConfig.application_name, 'retailsync-backend');
    assert.equal(poolConfig.max, 10);
  });

  it('(control) an un-stripped sslmode would silently drop the CA', () => {
    const ssl = resolvedSsl({ connectionString: env.AIVEN_PG_URI, ssl: { ca: CA, rejectUnauthorized: true } });
    assert.notDeepEqual(ssl, { ca: CA, rejectUnauthorized: true });
  });
});

describe('kafka service', () => {
  it('builds TLS + client-certificate config for ssl auth', () => {
    const config = buildKafkaClientConfig(loadKafkaConfig(env));
    assert.deepEqual(config.ssl, { rejectUnauthorized: true, ca: [CA], cert: CERT, key: KEY });
    assert.equal(config.sasl, undefined);
    assert.deepEqual(config.brokers, ['kafka-demo.aivencloud.com:12346']);
    assert.equal(config.clientId, 'retailsync-backend');
  });

  it('builds TLS + SASL config for sasl auth (no client cert)', () => {
    const config = buildKafkaClientConfig(
      loadKafkaConfig({
        AIVEN_CA_CERT_PATH: env.AIVEN_CA_CERT_PATH,
        AIVEN_KAFKA_BROKERS: 'kafka-demo.aivencloud.com:12350',
        AIVEN_KAFKA_AUTH: 'sasl',
        AIVEN_KAFKA_SASL_USERNAME: 'avnadmin',
        AIVEN_KAFKA_SASL_PASSWORD: 'pw',
      }),
    );
    assert.deepEqual(config.ssl, { rejectUnauthorized: true, ca: [CA] });
    assert.deepEqual(config.sasl, { mechanism: 'scram-sha-256', username: 'avnadmin', password: 'pw' });
  });

  it('maps app log levels to KafkaJS levels', () => {
    assert.equal(toKafkaLogLevel('silent'), KafkaLogLevel.NOTHING);
    assert.equal(toKafkaLogLevel('error'), KafkaLogLevel.ERROR);
    assert.equal(toKafkaLogLevel('info'), KafkaLogLevel.WARN);
    assert.equal(toKafkaLogLevel('debug'), KafkaLogLevel.DEBUG);
  });
});

describe('opensearch service', () => {
  it('passes credentials via auth, never in the node URL, with verified TLS', () => {
    const options = buildOpenSearchClientOptions(loadOpenSearchConfig(env));
    assert.equal(options.node, 'https://os-demo.aivencloud.com:12347');
    assert.deepEqual(options.auth, { username: 'avnadmin', password: 'pw' });
    assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  });
});

describe('singletons', () => {
  const saved: Record<string, string | undefined> = {};

  before(() => {
    for (const [key, value] of Object.entries(env)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
    resetConfigCache();
  });

  after(async () => {
    await Promise.all([closePgPool(), disconnectKafka(), closeOpenSearch()]);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetConfigCache();
  });

  it('returns the same instance until closed, then a fresh one', async () => {
    const pool = getPgPool();
    assert.equal(getPgPool(), pool);
    await closePgPool();
    assert.notEqual(getPgPool(), pool);

    const os = getOpenSearch();
    assert.equal(getOpenSearch(), os);
    await closeOpenSearch();
    assert.notEqual(getOpenSearch(), os);

    const kafka = getKafka();
    assert.equal(getKafka(), kafka);
    await disconnectKafka();
    assert.notEqual(getKafka(), kafka);
  });
});
