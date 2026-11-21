/**
 * Process entry point: validate configuration, start Fastify, shut down cleanly.
 */
import { buildApp } from './app.js';
import { kafkaOrderEventSink, kafkaStorefrontEventSink, startPipeline } from './events/kafka-pipeline.js';
import { pgDatabase } from './store/db.js';
import { ConfigError, describeConfig, getConfig, loadDotEnv, type AppConfig } from './config.js';

function loadConfigOrExit(): AppConfig {
  try {
    return getConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

// KafkaJS 2.2.4 schedules a negative timeout on Node >= 24 (harmless); keep other warnings.
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name !== 'TimeoutNegativeWarning') console.warn(warning);
});

let stopPipeline: () => Promise<void> = async () => {};

async function main(): Promise<void> {
  const config = loadConfigOrExit();
  const db = pgDatabase();
  const app = buildApp({ logLevel: config.server.logLevel, db, orderEvents: kafkaOrderEventSink, storefrontEvents: kafkaStorefrontEventSink });

  app.log.info({ envFile: loadDotEnv() ?? null, config: describeConfig(config) }, 'configuration validated');

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      app.log.info({ signal }, 'shutting down');
      stopPipeline()
        .then(() => app.close())
        .then(
        () => process.exit(0),
        (error: unknown) => {
          app.log.error({ err: error }, 'error during shutdown');
          process.exit(1);
        },
      );
    });
  }

  await app.listen({ host: config.server.host, port: config.server.port });

  // Kafka consumers run in-process (orders.placed -> inventory.updated -> OpenSearch).
  // Started after listen so a slow broker never delays the API becoming ready.
  startPipeline(db, app.log).then(
    (stop) => {
      stopPipeline = stop;
    },
    (error: unknown) => app.log.error({ err: error }, 'kafka pipeline failed to start; API keeps serving'),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
