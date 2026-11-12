/**
 * Aiven for OpenSearch client singleton.
 *
 * TLS: always verified (`rejectUnauthorized: true`). Aiven OpenSearch presents
 * a publicly trusted certificate, so system CAs are used unless an explicit
 * CA override is configured. Credentials are passed via `auth` rather than
 * embedded in the node URL so they never appear in client logs or errors.
 */
import { Client, type ClientOptions } from '@opensearch-project/opensearch';

import { getOpenSearchConfig, type OpenSearchConfig } from '../config.js';

/** Build the OpenSearch client options for a validated config (pure, no I/O). */
export function buildOpenSearchClientOptions(config: OpenSearchConfig): ClientOptions {
  return {
    node: config.node,
    auth: { username: config.username, password: config.password },
    ssl: {
      rejectUnauthorized: true,
      ...(config.ca ? { ca: config.ca } : {}),
    },
    requestTimeout: 30_000,
    maxRetries: 3,
  };
}

let client: Client | undefined;

/** Process-wide OpenSearch client, created on first use from validated environment config. */
export function getOpenSearch(): Client {
  return (client ??= new Client(buildOpenSearchClientOptions(getOpenSearchConfig())));
}

export interface OpenSearchHealth {
  latencyMs: number;
  clusterName: string;
  status: string;
  version: string;
}

/** Cluster info + health round-trip: proves TLS, authentication, and cluster state. */
export async function checkOpenSearch(): Promise<OpenSearchHealth> {
  const started = performance.now();
  const os = getOpenSearch();
  const [info, health] = await Promise.all([os.info(), os.cluster.health()]);
  return {
    latencyMs: Math.round(performance.now() - started),
    clusterName: health.body.cluster_name,
    status: String(health.body.status),
    version: info.body.version?.number ?? 'unknown',
  };
}

/** Close the shared client (idempotent). */
export async function closeOpenSearch(): Promise<void> {
  const current = client;
  client = undefined;
  if (current) await current.close();
}
