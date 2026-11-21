/**
 * Clerk session-token verification (networkless apart from a cached JWKS fetch).
 *
 * The frontend sends `Authorization: Bearer <Clerk session JWT>`. We check the
 * RS256 signature against the instance's JWKS, the issuer (derived from the
 * publishable key), expiry/not-before, and the `azp` origin. No Clerk secret
 * key is needed.
 *
 * Env:
 *   CLERK_PUBLISHABLE_KEY (or VITE_CLERK_PUBLISHABLE_KEY)  identifies the instance
 *   CLERK_AUTHORIZED_PARTIES  comma-separated origins allowed in `azp`
 *   PLATFORM_OWNER_CLERK_ID   the platform owner's Clerk user id
 */
import { createPublicKey, verify as verifySignature, type webcrypto } from 'node:crypto';

type JsonWebKey = webcrypto.JsonWebKey;

import type { FastifyRequest } from 'fastify';

import { loadDotEnv } from '../config.js';
import { AppError } from './contract.js';

export const DEFAULT_PLATFORM_OWNER_CLERK_ID = 'user_3MPoGBbBQ4HVZD7NBfbGqH3CBY5';
const DEFAULT_AUTHORIZED_PARTIES = [
  'https://retailsync-sable.vercel.app',
  'https://retailsync-gtim.onrender.com',
  'http://localhost:5174',
];
const CLOCK_SKEW_S = 10;

export interface AuthUser {
  userId: string;
  isPlatformOwner: boolean;
}

/** Verifies a bearer token and returns the caller, or throws 401. */
export type TokenVerifier = (token: string) => Promise<{ sub: string }>;

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** pk_test_<base64("host$")> -> "https://host" */
export function issuerFromPublishableKey(pk: string): string {
  const m = /^pk_(?:test|live)_(.+)$/.exec(pk.trim());
  if (!m) throw new Error('invalid Clerk publishable key');
  const host = Buffer.from(m[1]!, 'base64').toString('utf8').replace(/\$$/, '');
  if (!/^[a-z0-9.-]+$/i.test(host)) throw new Error('invalid Clerk publishable key');
  return `https://${host}`;
}

const unauthorized = (why: string) => new AppError(401, 'UNAUTHENTICATED', `Sign in required (${why})`);

export function clerkVerifier(opts: { issuer: string; authorizedParties: string[]; fetchJwks?: () => Promise<{ keys: (JsonWebKey & { kid?: string })[] }>; now?: () => number }): TokenVerifier {
  const fetchJwks = opts.fetchJwks ?? (async () => {
    const res = await fetch(`${opts.issuer}/.well-known/jwks.json`);
    if (!res.ok) throw new Error(`JWKS fetch failed with ${res.status}`);
    return (await res.json()) as { keys: (JsonWebKey & { kid?: string })[] };
  });
  let cache: { at: number; keys: (JsonWebKey & { kid?: string })[] } | null = null;
  const now = opts.now ?? (() => Date.now());

  async function keyFor(kid: string) {
    const fresh = cache && now() - cache.at < 3_600_000;
    let jwk = fresh ? cache!.keys.find((k) => k.kid === kid) : undefined;
    if (!jwk) {
      // Unknown kid: refresh once (key rotation).
      cache = { at: now(), keys: (await fetchJwks()).keys };
      jwk = cache.keys.find((k) => k.kid === kid);
    }
    if (!jwk) throw unauthorized('unknown signing key');
    return createPublicKey({ key: jwk, format: 'jwk' });
  }

  return async (token) => {
    const parts = token.split('.');
    if (parts.length !== 3) throw unauthorized('malformed token');
    let header: { alg?: string; kid?: string };
    let claims: { sub?: string; iss?: string; exp?: number; nbf?: number; azp?: string };
    try {
      header = JSON.parse(b64url(parts[0]!).toString('utf8'));
      claims = JSON.parse(b64url(parts[1]!).toString('utf8'));
    } catch {
      throw unauthorized('malformed token');
    }
    if (header.alg !== 'RS256' || !header.kid) throw unauthorized('unsupported token');
    const ok = verifySignature('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), await keyFor(header.kid), b64url(parts[2]!));
    if (!ok) throw unauthorized('bad signature');
    const t = now() / 1000;
    if (claims.iss !== opts.issuer) throw unauthorized('wrong issuer');
    if (typeof claims.exp !== 'number' || claims.exp < t - CLOCK_SKEW_S) throw unauthorized('expired');
    if (typeof claims.nbf === 'number' && claims.nbf > t + CLOCK_SKEW_S) throw unauthorized('not yet valid');
    if (claims.azp && !opts.authorizedParties.includes(claims.azp)) throw unauthorized('unknown origin');
    if (!claims.sub) throw unauthorized('no subject');
    return { sub: claims.sub };
  };
}

/** Production verifier from env; null when no publishable key is configured (writes are then refused). */
export function verifierFromEnv(): TokenVerifier | null {
  loadDotEnv();
  const pk = process.env.CLERK_PUBLISHABLE_KEY?.trim() || process.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
  if (!pk) return null;
  const parties = process.env.CLERK_AUTHORIZED_PARTIES?.split(',').map((s) => s.trim()).filter(Boolean);
  return clerkVerifier({ issuer: issuerFromPublishableKey(pk), authorizedParties: parties?.length ? parties : DEFAULT_AUTHORIZED_PARTIES });
}

export function platformOwnerId(): string {
  return process.env.PLATFORM_OWNER_CLERK_ID?.trim() || DEFAULT_PLATFORM_OWNER_CLERK_ID;
}

export async function requireUser(request: FastifyRequest, verifier: TokenVerifier | null): Promise<AuthUser> {
  if (!verifier) throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'Sign-in is not configured on this server');
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? '');
  if (!m) throw unauthorized('missing token');
  const { sub } = await verifier(m[1]!);
  return { userId: sub, isPlatformOwner: sub === platformOwnerId() };
}
