/**
 * Merchant storefronts shared across all visitors (v1.04).
 *
 *   GET    /api/stores        public list (homepage carousel, store pages)
 *   POST   /api/stores        create; caller becomes the owner        (signed in)
 *   PUT    /api/stores/:id    replace the storefront document         (owner or platform owner)
 *   DELETE /api/stores/:id    remove                                  (owner or platform owner)
 *
 * Identity comes only from the verified Clerk token; `id`, `ownerId` and
 * timestamps in the body are ignored.
 */
import { randomUUID } from 'node:crypto';

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { requireUser, type TokenVerifier } from '../http/clerk-auth.js';
import { AppError, notFound, parseInput } from '../http/contract.js';
import type { Database } from '../store/db.js';

const MAX_STORES_PER_OWNER = 10;
const BODY_LIMIT = 2 * 1024 * 1024; // logos/banners may be data URLs (≤500KB / ≤1MB client-side)

const product = z.looseObject({
  id: z.string().max(100),
  name: z.string().trim().min(1).max(120),
  price: z.string().max(30),
  emoji: z.string().max(16),
  stock: z.number().int().min(0).max(1_000_000),
});

/** The frontend store model; unknown presentation fields are kept as-is. */
const storeBody = z.looseObject({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(60),
  tagline: z.string().max(200),
  description: z.string().max(2000),
  primaryColor: z.string().max(40),
  accentColor: z.string().max(40),
  catalog: z.array(product).max(200),
});

const idParam = z.object({ id: z.string().regex(/^ms_[0-9a-f-]{36}$/, 'Expected a merchant store id') });

interface Row { id: string; owner_id: string; data: Record<string, unknown>; created_at: Date }

const toStore = (r: Row) => ({
  ...r.data,
  id: r.id,
  ownerId: r.owner_id,
  createdDate: new Date(r.created_at).toISOString(),
});

export interface MerchantStoreRoutesOptions {
  db: Database;
  /** null = sign-in not configured; writes answer 503. */
  verifier: TokenVerifier | null;
}

export const merchantStoreRoutes: FastifyPluginAsync<MerchantStoreRoutesOptions> = async (app, { db, verifier }) => {
  app.get('/stores', async () => {
    const { rows } = await db.query<Row>('SELECT id, owner_id, data, created_at FROM merchant_stores ORDER BY created_at DESC LIMIT 500');
    return { items: rows.map(toStore) };
  });

  app.post('/stores', { bodyLimit: BODY_LIMIT }, async (request, reply) => {
    const user = await requireUser(request, verifier);
    const body = parseInput(storeBody, request.body, 'body');
    const { id: _id, ownerId: _o, createdDate: _c, ...data } = body as Record<string, unknown>;

    const store = await db.transaction(async (tx) => {
      // Serialise this owner's creates so the per-owner cap holds under concurrency.
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [user.userId]);
      const { rows } = await tx.query<{ n: string }>('SELECT count(*)::text AS n FROM merchant_stores WHERE owner_id = $1', [user.userId]);
      if (!user.isPlatformOwner && Number(rows[0]?.n ?? 0) >= MAX_STORES_PER_OWNER) {
        throw new AppError(409, 'STORE_LIMIT_REACHED', `You can own at most ${MAX_STORES_PER_OWNER} stores`);
      }
      const inserted = await tx.query<Row>(
        'INSERT INTO merchant_stores (id, owner_id, data) VALUES ($1, $2, $3) RETURNING id, owner_id, data, created_at',
        [`ms_${randomUUID()}`, user.userId, JSON.stringify(data)],
      );
      return inserted.rows[0]!;
    });
    return reply.code(201).send(toStore(store));
  });

  app.put('/stores/:id', { bodyLimit: BODY_LIMIT }, async (request) => {
    const user = await requireUser(request, verifier);
    const { id } = parseInput(idParam, request.params, 'params');
    const body = parseInput(storeBody, request.body, 'body');
    const { id: _id, ownerId: _o, createdDate: _c, ...data } = body as Record<string, unknown>;
    const { rows } = await db.query<Row>(
      `UPDATE merchant_stores SET data = $2, updated_at = now()
        WHERE id = $1 AND (owner_id = $3 OR $4)
        RETURNING id, owner_id, data, created_at`,
      [id, JSON.stringify(data), user.userId, user.isPlatformOwner],
    );
    if (!rows[0]) await assertExists(id);
    return toStore(rows[0]!);
  });

  app.delete('/stores/:id', async (request, reply) => {
    const user = await requireUser(request, verifier);
    const { id } = parseInput(idParam, request.params, 'params');
    const { rowCount } = await db.query('DELETE FROM merchant_stores WHERE id = $1 AND (owner_id = $2 OR $3)', [id, user.userId, user.isPlatformOwner]);
    if (!rowCount) await assertExists(id);
    return reply.code(204).send();
  });

  /** After a no-op write: 404 if the store is missing, otherwise the caller is not its owner. */
  async function assertExists(id: string): Promise<never> {
    const { rows } = await db.query('SELECT 1 FROM merchant_stores WHERE id = $1', [id]);
    if (!rows.length) throw notFound('STORE_NOT_FOUND', 'Store not found');
    throw new AppError(403, 'NOT_STORE_OWNER', 'Only the store owner can change this store');
  }
};
