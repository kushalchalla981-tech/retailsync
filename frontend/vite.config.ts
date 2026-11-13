import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server on 5173; the Fastify backend owns 3000. /api is proxied so the
// browser talks to one origin and no credentials ever reach the bundle.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
