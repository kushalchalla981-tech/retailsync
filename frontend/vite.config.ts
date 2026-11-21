import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

/** Commit being built: Vercel/Render provide it; fall back to local git. */
function commitSha(): string {
  const fromHost = process.env.VERCEL_GIT_COMMIT_SHA || process.env.RENDER_GIT_COMMIT;
  if (fromHost) return fromHost;
  try { return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; }
}

export default defineConfig(({ command, mode }) => {
  // A build without a real Clerk key ships a site where sign-in silently never works.
  if (command === 'build') {
    const key = loadEnv(mode, process.cwd(), 'VITE_').VITE_CLERK_PUBLISHABLE_KEY ?? '';
    if (!/^pk_(test|live)_/.test(key) || key.includes('placeholder')) {
      throw new Error('VITE_CLERK_PUBLISHABLE_KEY is missing or invalid; set it in the hosting env (or frontend/.env.local).');
    }
  }

  return {
    plugins: [react()],
    define: { __COMMIT_SHA__: JSON.stringify(commitSha()) },
    server: {
      port: 5174,
      host: true,
      // Backend (Fastify) listens on 3000; same-origin /api in dev, like the Vercel rewrite in prod.
      proxy: {
        '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000', changeOrigin: true },
      },
    },
  };
});
