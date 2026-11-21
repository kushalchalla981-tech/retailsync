/** Backend origin. Empty = same origin (/api proxied by Vite in dev, Vercel rewrite in prod). */
export const API_BASE = import.meta.env.VITE_API_BASE ?? '';
