import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  ConfigError,
  describeConfig,
  loadConfig,
  loadKafkaConfig,
  loadOpenSearchConfig,
  loadPostgresConfig,
  loadServerConfig,
} from './config.js';

const CA = '-----BEGIN CERTIFICATE-----\nMIIBshared-ca\n-----END CERTIFICATE-----\n';
const PG_CA = '-----BEGIN CERTIFICATE-----\nMIIBpg-only-ca\n-----END CERTIFICATE-----\n';
const CERT = '-----BEGIN CERTIFICATE-----\nMIIBclient-cert\n-----END CERTIFICATE-----\n';
const KEY = '-----BEGIN PRIVATE KEY-----\nMIIEclient-key\n-----END PRIVATE KEY-----\n';
const SECRET = 'S3cr3t-p@ss';

const certDir = mkdtempSync(join(tmpdir(), 'retailsync-config-test-'));
writeFileSync(join(certDir, 'ca.pem'), CA);
writeFileSync(join(certDir, 'pg-ca.pem'), PG_CA);
writeFileSync(join(certDir, 'service.cert'), CERT);
writeFileSync(join(certDir, 'service.key'), KEY);
writeFileSync(join(certDir, 'not-a-cert.pem'), 'hello');
const opts = { baseDir: certDir };

const validEnv = {
  AIVEN_CA_CERT_PATH: './ca.pem',
  AIVEN_PG_URI: `postgres://avnadmin:${encodeURIComponent(SECRET)}@pg-demo.aivencloud.com:12345/defaultdb?sslmode=require&application_name=retailsync`,
  AIVEN_KAFKA_BROKERS: 'kafka-demo.aivencloud.com:12346, kafka-demo-2.aivencloud.com:12346',
  AIVEN_KAFKA_ACCESS_CERT_PATH: './service.cert',
  AIVEN_KAFKA_ACCESS_KEY_PATH: './service.key',
  AIVEN_OPENSEARCH_URI: `https://avnadmin:${encodeURIComponent(SECRET)}@os-demo.aivencloud.com:12347`,
};

function issuesOf(fn: () => unknown): readonly string[] {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof ConfigError, `expected ConfigError, got ${String(error)}`);
    assert.ok(!error.message.includes(SECRET), 'error message must not leak secrets');
    return error.issues;
  }
  assert.fail('expected ConfigError to be thrown');
}

describe('loadServerConfig', () => {
  it('applies defaults when nothing is set', () => {
    assert.deepEqual(loadServerConfig({}), { nodeEnv: 'development', host: '0.0.0.0', port: 3000, logLevel: 'info' });
  });

  it('treats empty strings as unset and coerces numbers', () => {
    assert.equal(loadServerConfig({ PORT: '', LOG_LEVEL: 'DEBUG' }).port, 3000);
    assert.equal(loadServerConfig({ PORT: '8080' }).port, 8080);
    assert.equal(loadServerConfig({ LOG_LEVEL: 'DEBUG' }).logLevel, 'debug');
  });

  it('rejects an out-of-range PORT', () => {
    const issues = issuesOf(() => loadServerConfig({ PORT: '70000' }));
    assert.equal(issues.length, 1);
    assert.match(issues[0]!, /^PORT:/);
  });
});

describe('loadPostgresConfig', () => {
  it('strips libpq ssl params so the explicit CA-verified ssl object is honoured', () => {
    const pg = loadPostgresConfig(validEnv, opts);
    const url = new URL(pg.connectionString);
    assert.equal(url.searchParams.has('sslmode'), false);
    assert.equal(url.searchParams.get('application_name'), 'retailsync');
    assert.deepEqual(pg.ssl, { ca: CA, rejectUnauthorized: true });
    assert.equal(pg.host, 'pg-demo.aivencloud.com');
    assert.equal(pg.port, 12345);
    assert.equal(pg.database, 'defaultdb');
    assert.equal(pg.user, 'avnadmin');
    assert.deepEqual(pg.pool, { max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
  });

  it('prefers the PostgreSQL-specific CA over the shared CA', () => {
    const pg = loadPostgresConfig({ ...validEnv, AIVEN_PG_CA_CERT_PATH: './pg-ca.pem' }, opts);
    assert.equal(pg.ssl.ca, PG_CA);
  });

  it('accepts an inline CA with escaped newlines', () => {
    const { AIVEN_CA_CERT_PATH: _unused, ...env } = validEnv;
    const pg = loadPostgresConfig({ ...env, AIVEN_CA_CERT: CA.trim().replace(/\n/g, '\\n') }, opts);
    assert.equal(pg.ssl.ca, CA);
  });

  it('reports every missing variable at once', () => {
    const issues = issuesOf(() => loadPostgresConfig({}, opts));
    assert.ok(issues.some((i) => i.startsWith('AIVEN_PG_URI: is required')));
    assert.ok(issues.some((i) => i.startsWith('AIVEN_CA_CERT_PATH: is required')));
  });

  it('rejects non-postgres URIs, missing CA files, and non-PEM files', () => {
    assert.ok(
      issuesOf(() => loadPostgresConfig({ ...validEnv, AIVEN_PG_URI: 'mysql://u:p@h:1/db' }, opts)).some((i) =>
        i.includes('must start with postgres://'),
      ),
    );
    assert.ok(
      issuesOf(() => loadPostgresConfig({ ...validEnv, AIVEN_CA_CERT_PATH: './missing.pem' }, opts)).some((i) =>
        i.includes('file not found'),
      ),
    );
    assert.ok(
      issuesOf(() => loadPostgresConfig({ ...validEnv, AIVEN_CA_CERT_PATH: './not-a-cert.pem' }, opts)).some((i) =>
        i.includes('does not contain a PEM certificate'),
      ),
    );
  });

  it('never echoes an unparseable URI (it may contain a password)', () => {
    const issues = issuesOf(() => loadPostgresConfig({ ...validEnv, AIVEN_PG_URI: `not a url ${SECRET}` }, opts));
    assert.deepEqual(issues, ['AIVEN_PG_URI: is not a valid URL']);
  });
});

describe('loadKafkaConfig', () => {
  it('builds client-certificate (ssl) auth by default', () => {
    const kafka = loadKafkaConfig(validEnv, opts);
    assert.deepEqual(kafka.brokers, ['kafka-demo.aivencloud.com:12346', 'kafka-demo-2.aivencloud.com:12346']);
    assert.equal(kafka.clientId, 'retailsync-backend');
    assert.equal(kafka.ca, CA);
    assert.deepEqual(kafka.auth, { method: 'ssl', cert: CERT, key: KEY });
  });

  it('requires the client cert and key for ssl auth', () => {
    const issues = issuesOf(() =>
      loadKafkaConfig({ AIVEN_KAFKA_BROKERS: 'k:1', AIVEN_CA_CERT_PATH: './ca.pem' }, opts),
    );
    assert.ok(issues.some((i) => i.startsWith('AIVEN_KAFKA_ACCESS_CERT_PATH: is required')));
    assert.ok(issues.some((i) => i.startsWith('AIVEN_KAFKA_ACCESS_KEY_PATH: is required')));
  });

  it('builds SASL auth with a case-insensitive mechanism', () => {
    const kafka = loadKafkaConfig(
      {
        AIVEN_KAFKA_BROKERS: 'kafka-demo.aivencloud.com:12350',
        AIVEN_CA_CERT_PATH: './ca.pem',
        AIVEN_KAFKA_AUTH: 'SASL',
        AIVEN_KAFKA_SASL_MECHANISM: 'SCRAM-SHA-512',
        AIVEN_KAFKA_SASL_USERNAME: 'avnadmin',
        AIVEN_KAFKA_SASL_PASSWORD: SECRET,
      },
      opts,
    );
    assert.deepEqual(kafka.auth, { method: 'sasl', mechanism: 'scram-sha-512', username: 'avnadmin', password: SECRET });
  });

  it('requires SASL credentials and valid host:port brokers', () => {
    const issues = issuesOf(() =>
      loadKafkaConfig(
        { AIVEN_KAFKA_BROKERS: 'good:9092,bad-no-port', AIVEN_CA_CERT_PATH: './ca.pem', AIVEN_KAFKA_AUTH: 'sasl' },
        opts,
      ),
    );
    assert.ok(issues.includes('AIVEN_KAFKA_BROKERS: entry #2 is not a valid host:port'));
    assert.ok(issues.includes('AIVEN_KAFKA_SASL_USERNAME: is required when AIVEN_KAFKA_AUTH=sasl'));
    assert.ok(issues.includes('AIVEN_KAFKA_SASL_PASSWORD: is required when AIVEN_KAFKA_AUTH=sasl'));
  });
});

describe('loadOpenSearchConfig', () => {
  it('splits credentials out of the node URL', () => {
    const os = loadOpenSearchConfig(validEnv, opts);
    assert.deepEqual(os, {
      node: 'https://os-demo.aivencloud.com:12347',
      username: 'avnadmin',
      password: SECRET,
    });
  });

  it('requires https and credentials', () => {
    const issues = issuesOf(() => loadOpenSearchConfig({ AIVEN_OPENSEARCH_URI: 'http://os-demo:9200' }, opts));
    assert.ok(issues.includes('AIVEN_OPENSEARCH_URI: must use https://'));
    assert.ok(issues.some((i) => i.startsWith('AIVEN_OPENSEARCH_URI: must include credentials')));
  });

  it('uses an explicitly configured CA override only', () => {
    const os = loadOpenSearchConfig({ ...validEnv, AIVEN_OPENSEARCH_CA_CERT_PATH: './ca.pem' }, opts);
    assert.equal(os.ca, CA);
  });
});

describe('loadConfig', () => {
  it('returns all sections for a complete environment', () => {
    const config = loadConfig(validEnv, opts);
    assert.equal(config.server.port, 3000);
    assert.equal(config.kafka.auth.method, 'ssl');
    const summary = JSON.stringify(describeConfig(config));
    assert.ok(!summary.includes(SECRET), 'describeConfig must not leak secrets');
    assert.ok(!summary.includes('BEGIN'), 'describeConfig must not include certificates');
  });

  it('aggregates issues from every section', () => {
    const issues = issuesOf(() => loadConfig({ PORT: 'abc' }, opts));
    for (const prefix of ['PORT:', 'AIVEN_PG_URI:', 'AIVEN_KAFKA_BROKERS:', 'AIVEN_OPENSEARCH_URI:']) {
      assert.ok(
        issues.some((i) => i.startsWith(prefix)),
        `expected an issue for ${prefix}`,
      );
    }
  });
});
