/**
 * Runtime configuration for RetailSync.
 *
 * Loads `.env` (if present), then validates and normalises the Aiven
 * PostgreSQL, Apache Kafka, and OpenSearch connection parameters into typed
 * objects consumed by `services/*`.
 *
 * Design rules:
 * - Each service section is validated independently (`getPostgresConfig()`,
 *   `getKafkaConfig()`, ...) so a diagnostic for one service is not blocked by
 *   a misconfiguration of another. `getConfig()` validates everything and
 *   reports all problems at once.
 * - Error messages name the offending variable but NEVER echo its value
 *   (values are credentials or certificates).
 * - TLS is always on with certificate verification (`rejectUnauthorized: true`);
 *   there is intentionally no switch to disable it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Repository root (this file lives at backend/src/config.ts or backend/dist/config.js). */
export const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export type Env = Readonly<Record<string, string | undefined>>;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type NodeEnv = 'development' | 'production' | 'test';
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface ServerConfig {
  nodeEnv: NodeEnv;
  host: string;
  port: number;
  logLevel: LogLevel;
}

export interface TlsVerifyConfig {
  /** PEM-encoded CA certificate(s) used to verify the server. */
  ca: string;
  rejectUnauthorized: true;
}

export interface PostgresConfig {
  /** Service URI with libpq `ssl*` query parameters removed (TLS is set via `ssl`). */
  connectionString: string;
  host: string;
  port: number;
  database: string;
  user: string;
  ssl: TlsVerifyConfig;
  pool: {
    max: number;
    idleTimeoutMillis: number;
    connectionTimeoutMillis: number;
  };
}

export type KafkaSaslMechanism = 'plain' | 'scram-sha-256' | 'scram-sha-512';

export type KafkaAuthConfig =
  | { method: 'ssl'; cert: string; key: string }
  | { method: 'sasl'; mechanism: KafkaSaslMechanism; username: string; password: string };

export interface KafkaConfig {
  clientId: string;
  brokers: string[];
  /** PEM CA certificate used to verify the brokers. */
  ca: string;
  auth: KafkaAuthConfig;
}

export interface OpenSearchConfig {
  /** Endpoint URL WITHOUT embedded credentials (safe to log). */
  node: string;
  username: string;
  password: string;
  /** Optional CA override; Aiven OpenSearch uses publicly trusted certificates by default. */
  ca?: string;
}

export interface AppConfig {
  server: ServerConfig;
  postgres: PostgresConfig;
  kafka: KafkaConfig;
  opensearch: OpenSearchConfig;
}

export class ConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}\n` +
        'Copy .env.example to .env in the repository root and fill in the Aiven values.',
    );
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Treat unset, empty, and whitespace-only variables uniformly as "not set". */
function normaliseEnv(env: Env): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    const trimmed = value?.trim();
    out[key] = trimmed ? trimmed : undefined;
  }
  return out;
}

function zodIssues(error: z.ZodError): string[] {
  // Only the variable name and zod's message are reported - never the input value.
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}

const lowercase = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : value);

const required = (description: string) => z.string({ error: `is required (${description})` });

const PEM_CERT = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/;
const PEM_KEY = /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/;

interface PemSource {
  pathVar: string;
  inlineVar: string;
}

/**
 * Resolve a PEM value from `<X>_PATH` (file, preferred) or `<X>` (inline text).
 * Sources are tried in order; the first one that is set is used.
 * Returns undefined when none of the sources is set.
 */
function readPem(
  env: Record<string, string | undefined>,
  sources: readonly PemSource[],
  kind: 'certificate' | 'private key',
  issues: string[],
  baseDir: string,
): string | undefined {
  const pattern = kind === 'certificate' ? PEM_CERT : PEM_KEY;

  for (const { pathVar, inlineVar } of sources) {
    const path = env[pathVar];
    if (path) {
      const absolute = isAbsolute(path) ? path : resolve(baseDir, path);
      if (!existsSync(absolute)) {
        issues.push(`${pathVar}: file not found at ${absolute}`);
        return undefined;
      }
      let contents: string;
      try {
        contents = readFileSync(absolute, 'utf8');
      } catch (error) {
        issues.push(`${pathVar}: could not read ${absolute} (${(error as NodeJS.ErrnoException).code ?? 'error'})`);
        return undefined;
      }
      if (!pattern.test(contents)) {
        issues.push(`${pathVar}: file does not contain a PEM ${kind}`);
        return undefined;
      }
      return contents;
    }

    const inline = env[inlineVar];
    if (inline) {
      // Support single-line values with literal "\n" escapes.
      const pem = inline.replace(/\\n/g, '\n');
      if (!pattern.test(pem)) {
        issues.push(`${inlineVar}: is not a PEM ${kind}`);
        return undefined;
      }
      return pem.endsWith('\n') ? pem : `${pem}\n`;
    }
  }
  return undefined;
}

/** Like readPem, but records a "required" issue when no source is set at all. */
function requirePem(
  env: Record<string, string | undefined>,
  sources: readonly [PemSource, ...PemSource[]],
  kind: 'certificate' | 'private key',
  issues: string[],
  baseDir: string,
  purpose: string,
): string | undefined {
  const before = issues.length;
  const pem = readPem(env, sources, kind, issues, baseDir);
  if (!pem && issues.length === before) {
    const names = sources.map((s) => `${s.pathVar} or ${s.inlineVar}`).join(', or ');
    const primary = sources[sources.length - 1]!.pathVar;
    issues.push(`${primary}: is required for ${purpose} (set ${names})`);
  }
  return pem;
}

function parseUrl(value: string, variable: string, issues: string[]): URL | undefined {
  try {
    return new URL(value);
  } catch {
    issues.push(`${variable}: is not a valid URL`);
    return undefined;
  }
}

const SHARED_CA: PemSource = { pathVar: 'AIVEN_CA_CERT_PATH', inlineVar: 'AIVEN_CA_CERT' };

export interface LoadOptions {
  /** Base directory for relative certificate paths. Defaults to the repository root. */
  baseDir?: string;
}

// ---------------------------------------------------------------------------
// Section loaders (pure: env in, typed config out, ConfigError on failure)
// ---------------------------------------------------------------------------

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.preprocess(
    lowercase,
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ),
});

export function loadServerConfig(rawEnv: Env): ServerConfig {
  const parsed = serverSchema.safeParse(normaliseEnv(rawEnv));
  if (!parsed.success) throw new ConfigError(zodIssues(parsed.error));
  const { NODE_ENV, HOST, PORT, LOG_LEVEL } = parsed.data;
  return { nodeEnv: NODE_ENV, host: HOST, port: PORT, logLevel: LOG_LEVEL };
}

const postgresSchema = z.object({
  AIVEN_PG_URI: required('Aiven PostgreSQL service URI'),
  PG_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  PG_IDLE_TIMEOUT_MS: z.coerce.number().int().min(0).default(30_000),
  PG_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(0).default(10_000),
});

/** libpq-style TLS parameters that pg would otherwise let override our explicit `ssl` object. */
const PG_STRIPPED_PARAMS = /^(ssl.*|uselibpqcompat)$/i;

export function loadPostgresConfig(rawEnv: Env, options: LoadOptions = {}): PostgresConfig {
  const env = normaliseEnv(rawEnv);
  const issues: string[] = [];
  const parsed = postgresSchema.safeParse(env);
  if (!parsed.success) issues.push(...zodIssues(parsed.error));

  const ca = requirePem(
    env,
    [{ pathVar: 'AIVEN_PG_CA_CERT_PATH', inlineVar: 'AIVEN_PG_CA_CERT' }, SHARED_CA],
    'certificate',
    issues,
    options.baseDir ?? PROJECT_ROOT,
    'PostgreSQL TLS verification',
  );

  let url: URL | undefined;
  if (parsed.success) {
    url = parseUrl(parsed.data.AIVEN_PG_URI, 'AIVEN_PG_URI', issues);
    if (url) {
      if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
        issues.push('AIVEN_PG_URI: must start with postgres:// or postgresql://');
      }
      if (!url.hostname) issues.push('AIVEN_PG_URI: is missing the host');
      if (!url.username) issues.push('AIVEN_PG_URI: is missing the username');
      if (!url.password) issues.push('AIVEN_PG_URI: is missing the password');
      if (url.pathname.length <= 1) issues.push('AIVEN_PG_URI: is missing the database name (e.g. /defaultdb)');
    }
  }

  if (issues.length > 0 || !parsed.success || !url || !ca) throw new ConfigError(issues);

  for (const key of [...url.searchParams.keys()]) {
    if (PG_STRIPPED_PARAMS.test(key)) url.searchParams.delete(key);
  }

  return {
    connectionString: url.toString(),
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    ssl: { ca, rejectUnauthorized: true },
    pool: {
      max: parsed.data.PG_POOL_MAX,
      idleTimeoutMillis: parsed.data.PG_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: parsed.data.PG_CONNECTION_TIMEOUT_MS,
    },
  };
}

// Brokers are validated separately so auth problems are still reported when
// AIVEN_KAFKA_BROKERS is missing (a first run should list everything at once).
const kafkaSchema = z.object({
  AIVEN_KAFKA_AUTH: z.preprocess(lowercase, z.enum(['ssl', 'sasl']).default('ssl')),
  AIVEN_KAFKA_SASL_MECHANISM: z.preprocess(
    lowercase,
    z.enum(['plain', 'scram-sha-256', 'scram-sha-512']).default('scram-sha-256'),
  ),
  AIVEN_KAFKA_SASL_USERNAME: z.string().optional(),
  AIVEN_KAFKA_SASL_PASSWORD: z.string().optional(),
  KAFKA_CLIENT_ID: z
    .string()
    .regex(/^[A-Za-z0-9._-]+$/, 'may only contain letters, digits, ".", "_" and "-"')
    .default('retailsync-backend'),
});

const BROKER = /^[A-Za-z0-9.-]+:(\d{1,5})$/;

export function loadKafkaConfig(rawEnv: Env, options: LoadOptions = {}): KafkaConfig {
  const env = normaliseEnv(rawEnv);
  const baseDir = options.baseDir ?? PROJECT_ROOT;
  const issues: string[] = [];
  const parsed = kafkaSchema.safeParse(env);
  if (!parsed.success) issues.push(...zodIssues(parsed.error));

  const brokers = (env.AIVEN_KAFKA_BROKERS ?? '')
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
  if (!env.AIVEN_KAFKA_BROKERS) {
    issues.push('AIVEN_KAFKA_BROKERS: is required (comma-separated Aiven Kafka host:port list)');
  } else {
    if (brokers.length === 0) issues.push('AIVEN_KAFKA_BROKERS: must list at least one host:port');
    for (const [index, broker] of brokers.entries()) {
      const match = BROKER.exec(broker);
      const port = match ? Number(match[1]) : 0;
      if (!match || port < 1 || port > 65535) {
        issues.push(`AIVEN_KAFKA_BROKERS: entry #${index + 1} is not a valid host:port`);
      }
    }
  }

  const ca = requirePem(
    env,
    [{ pathVar: 'AIVEN_KAFKA_CA_CERT_PATH', inlineVar: 'AIVEN_KAFKA_CA_CERT' }, SHARED_CA],
    'certificate',
    issues,
    baseDir,
    'Kafka TLS verification',
  );

  let auth: KafkaAuthConfig | undefined;
  if (parsed.success) {
    if (parsed.data.AIVEN_KAFKA_AUTH === 'ssl') {
      const purpose = 'Kafka client-certificate auth (AIVEN_KAFKA_AUTH=ssl)';
      const cert = requirePem(
        env,
        [{ pathVar: 'AIVEN_KAFKA_ACCESS_CERT_PATH', inlineVar: 'AIVEN_KAFKA_ACCESS_CERT' }],
        'certificate',
        issues,
        baseDir,
        purpose,
      );
      const key = requirePem(
        env,
        [{ pathVar: 'AIVEN_KAFKA_ACCESS_KEY_PATH', inlineVar: 'AIVEN_KAFKA_ACCESS_KEY' }],
        'private key',
        issues,
        baseDir,
        purpose,
      );
      if (cert && key) auth = { method: 'ssl', cert, key };
    } else {
      const { AIVEN_KAFKA_SASL_MECHANISM: mechanism, AIVEN_KAFKA_SASL_USERNAME: username, AIVEN_KAFKA_SASL_PASSWORD: password } =
        parsed.data;
      if (!username) issues.push('AIVEN_KAFKA_SASL_USERNAME: is required when AIVEN_KAFKA_AUTH=sasl');
      if (!password) issues.push('AIVEN_KAFKA_SASL_PASSWORD: is required when AIVEN_KAFKA_AUTH=sasl');
      if (username && password) auth = { method: 'sasl', mechanism, username, password };
    }
  }

  if (issues.length > 0 || !parsed.success || !ca || !auth) throw new ConfigError(issues);

  return { clientId: parsed.data.KAFKA_CLIENT_ID, brokers, ca, auth };
}

const opensearchSchema = z.object({
  AIVEN_OPENSEARCH_URI: required('Aiven OpenSearch service URI'),
});

export function loadOpenSearchConfig(rawEnv: Env, options: LoadOptions = {}): OpenSearchConfig {
  const env = normaliseEnv(rawEnv);
  const issues: string[] = [];
  const parsed = opensearchSchema.safeParse(env);
  if (!parsed.success) issues.push(...zodIssues(parsed.error));

  // Optional: only used when explicitly configured (no fallback to the shared CA,
  // because Aiven OpenSearch presents a publicly trusted certificate).
  const ca = readPem(
    env,
    [{ pathVar: 'AIVEN_OPENSEARCH_CA_CERT_PATH', inlineVar: 'AIVEN_OPENSEARCH_CA_CERT' }],
    'certificate',
    issues,
    options.baseDir ?? PROJECT_ROOT,
  );

  let url: URL | undefined;
  if (parsed.success) {
    url = parseUrl(parsed.data.AIVEN_OPENSEARCH_URI, 'AIVEN_OPENSEARCH_URI', issues);
    if (url) {
      if (url.protocol !== 'https:') issues.push('AIVEN_OPENSEARCH_URI: must use https://');
      if (!url.hostname) issues.push('AIVEN_OPENSEARCH_URI: is missing the host');
      if (!url.username || !url.password) {
        issues.push('AIVEN_OPENSEARCH_URI: must include credentials (https://user:password@host:port)');
      }
    }
  }

  if (issues.length > 0 || !url) throw new ConfigError(issues);

  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
  return {
    node: `${url.protocol}//${url.host}${path}`,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ...(ca ? { ca } : {}),
  };
}

/** Validate every section, aggregating all issues into one ConfigError. */
export function loadConfig(rawEnv: Env, options: LoadOptions = {}): AppConfig {
  const issues: string[] = [];
  const attempt = <T>(load: () => T): T | undefined => {
    try {
      return load();
    } catch (error) {
      if (error instanceof ConfigError) {
        issues.push(...error.issues);
        return undefined;
      }
      throw error;
    }
  };

  const server = attempt(() => loadServerConfig(rawEnv));
  const postgres = attempt(() => loadPostgresConfig(rawEnv, options));
  const kafka = attempt(() => loadKafkaConfig(rawEnv, options));
  const opensearch = attempt(() => loadOpenSearchConfig(rawEnv, options));

  if (!server || !postgres || !kafka || !opensearch) throw new ConfigError(issues);
  return { server, postgres, kafka, opensearch };
}

/** Non-secret summary of the configuration, safe for logs and diagnostics. */
export function describeConfig(config: Partial<AppConfig>): Record<string, unknown> {
  return {
    ...(config.server && { server: { ...config.server } }),
    ...(config.postgres && {
      postgres: {
        host: config.postgres.host,
        port: config.postgres.port,
        database: config.postgres.database,
        user: config.postgres.user,
        tls: 'verify-full (custom CA)',
        poolMax: config.postgres.pool.max,
      },
    }),
    ...(config.kafka && {
      kafka: {
        clientId: config.kafka.clientId,
        brokers: config.kafka.brokers,
        auth: config.kafka.auth.method === 'ssl' ? 'ssl (client certificate)' : `sasl (${config.kafka.auth.mechanism})`,
        tls: 'verify-full (custom CA)',
      },
    }),
    ...(config.opensearch && {
      opensearch: {
        node: config.opensearch.node,
        user: config.opensearch.username,
        tls: config.opensearch.ca ? 'verify-full (custom CA)' : 'verify-full (system CAs)',
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Process-level accessors (load .env once, cache validated sections)
// ---------------------------------------------------------------------------

let envFileLoaded = false;
let loadedEnvFile: string | undefined;

/**
 * Load the first `.env` found in the current working directory or the
 * repository root. Variables already present in the process environment win.
 * Returns the path of the loaded file, if any.
 */
export function loadDotEnv(): string | undefined {
  if (envFileLoaded) return loadedEnvFile;
  envFileLoaded = true;
  const candidates = [...new Set([resolve(process.cwd(), '.env'), resolve(PROJECT_ROOT, '.env')])];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      loadedEnvFile = candidate;
      break;
    }
  }
  return loadedEnvFile;
}

const cache: Partial<AppConfig> = {};

export function getServerConfig(): ServerConfig {
  loadDotEnv();
  return (cache.server ??= loadServerConfig(process.env));
}

export function getPostgresConfig(): PostgresConfig {
  loadDotEnv();
  return (cache.postgres ??= loadPostgresConfig(process.env));
}

export function getKafkaConfig(): KafkaConfig {
  loadDotEnv();
  return (cache.kafka ??= loadKafkaConfig(process.env));
}

export function getOpenSearchConfig(): OpenSearchConfig {
  loadDotEnv();
  return (cache.opensearch ??= loadOpenSearchConfig(process.env));
}

/** Validate and return the full configuration (all sections). */
export function getConfig(): AppConfig {
  loadDotEnv();
  const config = loadConfig(process.env);
  Object.assign(cache, config);
  return config;
}

/** Test helper: forget cached sections so the next accessor re-reads process.env. */
export function resetConfigCache(): void {
  for (const key of Object.keys(cache) as (keyof AppConfig)[]) delete cache[key];
}
