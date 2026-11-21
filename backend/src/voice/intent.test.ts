import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classify, normalize } from './intent.js';
import { speakable } from './gnani-client.js';

const stores = [
  { id: 'store-1', name: 'CircuitHub' },
  { id: 'store-2', name: 'Threadline' },
  { id: 'store-3', name: 'Peel & Pour' },
];
const act = (t: string, creating?: object) => classify(t, { stores, creating: creating ?? null }).action;

describe('voice intents', () => {
  it('strips wake phrases', () => {
    assert.equal(normalize('Hey Sync, open the cart!'), 'open the cart');
    assert.equal(normalize('Retail Up go to CircuitHub'), 'go to circuithub');
  });
  it('navigates to stores as Gnani spells them', () => {
    assert.deepEqual(act('Go to circuit hub.'), { type: 'NAVIGATE_STORE', storeId: 'store-1', storeName: 'CircuitHub' });
    assert.equal((act('Show me Peel and Pour') as { storeId: string }).storeId, 'store-3');
    assert.deepEqual(act('next store'), { type: 'STEP_STORE', direction: 'next' });
    assert.deepEqual(act('previous store'), { type: 'STEP_STORE', direction: 'previous' });
  });
  it('opens and closes modules', () => {
    assert.deepEqual(act('Open cart'), { type: 'OPEN_MODULE', module: 'cart' });
    assert.deepEqual(act('close cart'), { type: 'CLOSE_MODULE', module: 'cart' });
    assert.deepEqual(act('Search for noise-cancelling headphones'), { type: 'OPEN_MODULE', module: 'search', query: 'noise cancelling headphones' });
    assert.deepEqual(act('Go to merchant studio'), { type: 'OPEN_MODULE', module: 'dashboard' });
    assert.deepEqual(act('Show Kafka ledger'), { type: 'OPEN_MODULE', module: 'ledger', service: 'kafka' });
    assert.deepEqual(act('check PostgreSQL'), { type: 'OPEN_MODULE', module: 'ledger', service: 'postgres' });
    assert.deepEqual(act('open about'), { type: 'OPEN_MODULE', module: 'about' });
    assert.deepEqual(act('Go back'), { type: 'CLOSE_OVERLAY' });
    assert.deepEqual(act('stop'), { type: 'STOP' });
  });
  it('runs the store creation conversation', () => {
    const start = classify('Create a new store called ZenTech', { stores });
    assert.deepEqual(start.action, { type: 'CREATE_STORE_INPUT', field: 'name', value: 'Zentech' });
    assert.match(start.reply!, /What type of store is Zentech/);
    assert.deepEqual(act('I want to start a fashion brand'), { type: 'CREATE_STORE_INPUT', field: 'name', value: '', category: 'Fashion & Apparel' });
    const cat = classify('Electronics and tech', { stores, creating: { name: 'Zentech' } });
    assert.deepEqual(cat.action, { type: 'CREATE_STORE_INPUT', field: 'category', value: 'Electronics & Tech' });
    assert.match(cat.reply!, /Which theme/);
    const theme = classify('Aurora', { stores, creating: { name: 'Zentech', category: 'Electronics & Tech' } });
    assert.match(theme.reply!, /Zentech is ready in Electronics & Tech with the Aurora theme. Shall I launch it now\?/);
    assert.deepEqual(act('Yes, launch it!', { name: 'Zentech', category: 'Electronics & Tech', theme: 'Aurora' }), { type: 'CREATE_STORE_INPUT', field: 'submit', value: 'yes' });
    assert.deepEqual(act('Zenith', {}), { type: 'CREATE_STORE_INPUT', field: 'name', value: 'Zenith' });
  });
  it('hands everything else to the store assistant', () => {
    assert.deepEqual(act('What is the price of sunglasses?'), { type: 'AI_QUERY', query: 'What is the price of sunglasses?' });
  });
  it('makes text speakable', () => {
    assert.equal(speakable('**Mug** costs ₹1,299 • 5 left'), 'Mug costs 1299 rupees 5 left');
  });
});
