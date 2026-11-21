import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildApp } from '../app.js';
import { createFakeDatabase } from '../testing/fake-db.js';
import type { SpeechClient } from '../voice/gnani-client.js';
import { rateLimiter } from './voice.js';

const said: string[] = [];
const speech: SpeechClient = {
  transcribe: async (audio, mime) => ({ text: `heard ${audio.length} bytes of ${mime}`, language: 'en-IN', latencyMs: 1 }),
  synthesize: async (text) => { said.push(text); return Buffer.from('RIFFfake'); },
};
const app = () => buildApp({ logLevel: 'silent', db: createFakeDatabase(), verifier: null, speech });

describe('voice routes', () => {
  it('transcribes a wav body', async () => {
    const a = app();
    const res = await a.inject({ method: 'POST', url: '/api/voice/transcribe', headers: { 'content-type': 'audio/wav' }, payload: Buffer.alloc(4000) });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().text, 'heard 4000 bytes of audio/wav');
    await a.close();
  });

  it('rejects empty audio before calling Gnani', async () => {
    const a = app();
    const res = await a.inject({ method: 'POST', url: '/api/voice/transcribe', headers: { 'content-type': 'audio/wav' }, payload: Buffer.alloc(10) });
    assert.equal(res.statusCode, 400);
    await a.close();
  });

  it('synthesizes speakable text as wav', async () => {
    const a = app();
    const res = await a.inject({ method: 'POST', url: '/api/voice/synthesize', payload: { text: 'Mug costs ₹1,299' } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'audio/wav');
    assert.equal(said.at(-1), 'Mug costs 1299 rupees');
    await a.close();
  });

  it('classifies a transcript', async () => {
    const a = app();
    const res = await a.inject({ method: 'POST', url: '/api/voice/action', payload: { transcript: 'Go to circuit hub', stores: [{ id: 'store-1', name: 'CircuitHub' }] } });
    assert.equal(res.json().action.type, 'NAVIGATE_STORE');
    assert.equal(res.json().reply, 'Opening CircuitHub.');
    await a.close();
  });

  it('rate limits per client and globally', () => {
    let t = 0;
    const limit = rateLimiter(2, 3, () => t);
    limit('a'); limit('a');
    assert.throws(() => limit('a'), /Too many/);
    limit('b');
    assert.throws(() => limit('c'), /Too many/, 'global cap');
    t = 3_600_000;
    limit('a');
  });
});
