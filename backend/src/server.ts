/**
 * Process entry point: validate configuration, start Fastify, shut down cleanly.
 */
import { buildApp } from './app.js';
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

async function main(): Promise<void> {
  const config = loadConfigOrExit();
  const app = buildApp({ logLevel: config.server.logLevel });

  app.log.info({ envFile: loadDotEnv() ?? null, config: describeConfig(config) }, 'configuration validated');

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      app.log.info({ signal }, 'shutting down');
      app.close().then(
        () => process.exit(0),
        (error: unknown) => {
          app.log.error({ err: error }, 'error during shutdown');
          process.exit(1);
        },
      );
    });
  }

  await app.listen({ host: config.server.host, port: config.server.port });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
