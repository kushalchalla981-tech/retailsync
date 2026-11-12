/**
 * Shared helpers for the provisioning CLIs (db:migrate, search:init, kafka:topics).
 *
 * Each provisioning module exports pure/testable functions and only runs its
 * `main` when executed directly (`tsx src/db/migrations.ts` or
 * `node dist/db/migrations.js`), never on import.
 */
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ConfigError } from './config.js';

/** True when the module with this `import.meta.url` is the process entry point. */
export function isMainModule(metaUrl: string, entry: string | undefined = process.argv[1]): boolean {
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(resolve(entry));
  } catch {
    return false;
  }
}

/** Render an unknown thrown value as a single safe line (no stack, no request bodies). */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Run a CLI entry point: report failures without stack noise, always release
 * connections, and set a non-zero exit code on error. Configuration errors
 * print the variable names to fix (values are never echoed by ConfigError).
 */
export async function runCli(
  name: string,
  main: (args: readonly string[]) => Promise<void>,
  cleanup: () => Promise<void>,
): Promise<void> {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.exitCode = 1;
    if (error instanceof ConfigError) {
      console.error(`[${name}] ${error.message}`);
    } else {
      console.error(`[${name}] FAILED: ${errorMessage(error)}`);
    }
  } finally {
    try {
      await cleanup();
    } catch (error) {
      console.error(`[${name}] cleanup error: ${errorMessage(error)}`);
    }
  }
}
