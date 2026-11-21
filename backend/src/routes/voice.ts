/**
 * Voice agent API (v1.06), backed by Gnani Prisma (STT) and Timbre (TTS):
 *   POST /api/voice/transcribe   audio/wav body (<= 30 s)      -> { text, language, latencyMs }
 *   POST /api/voice/synthesize   { text, voice? }              -> audio/wav
 *   POST /api/voice/action       { transcript, stores, creating } -> { action, reply }
 *
 * Gnani calls cost credit and these routes are public, so they are rate
 * limited per client and globally. The Gnani key never leaves the server.
 */
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AppError, parseInput } from '../http/contract.js';
import { gnaniClient, speakable, TTS_VOICES, type SpeechClient } from '../voice/gnani-client.js';
import { classify } from '../voice/intent.js';
import { askGemma3 } from '../voice/ollama-client.js';

const MAX_AUDIO_BYTES = 1_200_000; // 30 s of 16 kHz 16-bit mono WAV is ~960 KB
const PER_CLIENT_PER_MIN = 30;
const GLOBAL_PER_HOUR = 1500;

const synthBody = z.object({ text: z.string().trim().min(1).max(600), voice: z.enum(TTS_VOICES).default('Shivani') });
const actionBody = z.object({
  transcript: z.string().max(500),
  stores: z.array(z.object({ id: z.string().max(80), name: z.string().max(80) })).max(200).default([]),
  creating: z.object({ name: z.string().max(80).optional(), category: z.string().max(60).optional(), theme: z.string().max(30).optional() }).nullable().optional(),
});
const gemmaBody = z.object({
  query: z.string().trim().min(1).max(500),
  context: z
    .object({
      storeName: z.string().max(80).optional(),
      category: z.string().max(60).optional(),
      catalog: z.array(z.object({ name: z.string(), price: z.string(), stock: z.number() })).max(50).optional(),
      ordersCount: z.number().optional(),
    })
    .optional(),
});

/** Fixed-window counters; small and in-process (one Render instance). */
export function rateLimiter(perClient: number, global: number, now: () => number = Date.now) {
  const clients = new Map<string, { start: number; n: number }>();
  let hour = { start: now(), n: 0 };
  return (client: string) => {
    const t = now();
    if (t - hour.start >= 3_600_000) hour = { start: t, n: 0 };
    let c = clients.get(client);
    if (!c || t - c.start >= 60_000) {
      if (clients.size > 5000) clients.clear();
      c = { start: t, n: 0 };
      clients.set(client, c);
    }
    if (c.n >= perClient || hour.n >= global) throw new AppError(429, 'VOICE_RATE_LIMITED', 'Too many voice requests, please wait a moment');
    c.n += 1;
    hour.n += 1;
  };
}

const clientKey = (r: FastifyRequest) => String(r.headers['x-forwarded-for'] ?? '').split(',')[0]!.trim() || r.ip;

export const voiceRoutes: FastifyPluginAsync<{ speech?: SpeechClient }> = async (app, opts) => {
  const speech = opts.speech ?? gnaniClient;
  const limit = rateLimiter(PER_CLIENT_PER_MIN, GLOBAL_PER_HOUR);

  app.addContentTypeParser(['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/mpeg'], { parseAs: 'buffer', bodyLimit: MAX_AUDIO_BYTES }, (_req, body, done) => done(null, body));

  app.post('/voice/transcribe', { bodyLimit: MAX_AUDIO_BYTES }, async (request) => {
    const audio = request.body;
    if (!Buffer.isBuffer(audio) || audio.length < 1000) throw new AppError(400, 'VOICE_BAD_AUDIO', 'Send a short audio/wav recording');
    limit(clientKey(request));
    const mime = String(request.headers['content-type'] ?? 'audio/wav').split(';')[0]!;
    // ?hints=CircuitHub,Threadline: names on screen, so Gnani spells them right.
    const hints = String((request.query as { hints?: string }).hints ?? '')
      .split(',')
      .map((h) => h.trim().slice(0, 40))
      .filter((h) => /^[\p{L}\p{N} &'.-]+$/u.test(h))
      .slice(0, 40);
    return speech.transcribe(audio, mime, hints);
  });

  app.post('/voice/synthesize', async (request, reply) => {
    const { text, voice } = parseInput(synthBody, request.body, 'body');
    const spoken = speakable(text);
    if (!spoken) throw new AppError(400, 'VOICE_EMPTY_TEXT', 'Nothing to say');
    limit(clientKey(request));
    const wav = await speech.synthesize(spoken, voice);
    return reply.header('content-type', 'audio/wav').header('cache-control', 'no-store').send(wav);
  });

  app.post('/voice/action', async (request) => {
    const body = parseInput(actionBody, request.body, 'body');
    return classify(body.transcript, { stores: body.stores, creating: body.creating ?? null });
  });

  app.post('/voice/gemma', async (request) => {
    const { query, context } = parseInput(gemmaBody, request.body, 'body');
    const res = await askGemma3(query, context);
    if (!res) return { reply: null, model: 'none', latencyMs: 0 };
    return res;
  });
};
