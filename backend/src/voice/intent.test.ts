/**
 * Voice intent table: every action, phrasing variants, Hinglish, and real
 * transcripts as Gnani returns them (lowercase, split words, "card" for cart).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { speakable } from './gnani-client.js';
import { classify, normalize, type CreateDraft, type VoiceAction } from './intent.js';

const stores = ['CircuitHub', 'Threadline', 'Peel & Pour', 'Folio & Spine', 'Lumière', 'Hearthware'].map((name, i) => ({ id: `store-${i + 1}`, name }));
const run = (t: string, creating: CreateDraft | null = null) => classify(t, { stores, creating });
const act = (t: string, creating: CreateDraft | null = null) => run(t, creating).action;
const nav = (n: number): VoiceAction => ({ type: 'NAVIGATE_STORE', storeId: `store-${n}`, storeName: stores[n - 1]!.name });

function table(title: string, rows: [string, VoiceAction | ((a: VoiceAction) => boolean)][], creating: CreateDraft | null = null) {
  describe(title, () => {
    for (const [said, want] of rows) {
      it(`"${said}"`, () => {
        const got = act(said, creating);
        if (typeof want === 'function') assert.ok(want(got), `got ${JSON.stringify(got)}`);
        else assert.deepEqual(got, want);
      });
    }
  });
}
const type = (t: VoiceAction['type']) => (a: VoiceAction) => a.type === t;

describe('normalize', () => {
  it('strips wake phrases, punctuation and accents', () => {
    assert.equal(normalize('Hey Sync, open the cart!'), 'open the cart');
    assert.equal(normalize('Retail Up go to CircuitHub'), 'go to circuithub');
    assert.equal(normalize('Sync. Lumière'), 'lumiere');
  });
  it('maps Hinglish and the "card" mishearing', () => {
    assert.equal(normalize('Card kholo'), 'cart open');
    assert.equal(normalize('Agla store dikhao.'), 'next store open');
    assert.equal(normalize('Soh jaao'), 'sleep');
    assert.equal(normalize('buy a gift card'), 'buy a gift card');
  });
});

table('stores by number (the reported bug)', [
  ['open store 1', nav(1)],
  ['Open store one', nav(1)],
  ['open store number 2', nav(2)],
  ['Store number two kholo', nav(2)],
  ['go to store 3', nav(3)],
  ['take me to the third store', nav(3)],
  ['open the 4th store', nav(4)],
  ['show me the fifth shop', nav(5)],
  ['store six', nav(6)],
  ['open the last store', nav(6)],
  ['first store', nav(1)],
  ['pehla store kholo', nav(1)],
  ['open store 9', type('CLARIFY')],
]);

table('stores by name, as Gnani spells them', [
  ['Go to circuit hub.', nav(1)],
  ['open CircuitHub', nav(1)],
  ['Circuit hub kholo', nav(1)],
  ['Go to thread line', nav(2)],
  ['take me to threadlane', nav(2)],
  ['Show me Peel and Pour', nav(3)],
  ['Go to peel and pour.', nav(3)],
  ['Open folio and spine', nav(4)],
  ['visit lumiere', nav(5)],
  ['Lumière', nav(5)],
  ['hearthware', nav(6)],
  ['switch to the hearth ware store', nav(6)],
  ['launch store threadline', nav(2)],
]);

table('stepping through stores', [
  ['next store', { type: 'STEP_STORE', direction: 'next' }],
  ['next', { type: 'STEP_STORE', direction: 'next' }],
  ['show me the next one', { type: 'STEP_STORE', direction: 'next' }],
  ['Agla store dikhao.', { type: 'STEP_STORE', direction: 'next' }],
  ['previous store', { type: 'STEP_STORE', direction: 'previous' }],
  ['go to the previous one', { type: 'STEP_STORE', direction: 'previous' }],
  ['pichla store', { type: 'STEP_STORE', direction: 'previous' }],
]);

table('cart', [
  ['Open cart', { type: 'OPEN_MODULE', module: 'cart' }],
  ['open card', { type: 'OPEN_MODULE', module: 'cart' }],
  ['Card kholo', { type: 'OPEN_MODULE', module: 'cart' }],
  ['show my cart', { type: 'OPEN_MODULE', module: 'cart' }],
  ["what's in my cart", { type: 'OPEN_MODULE', module: 'cart' }],
  ['view basket', { type: 'OPEN_MODULE', module: 'cart' }],
  ['close cart', { type: 'CLOSE_MODULE', module: 'cart' }],
  ['close the card', { type: 'CLOSE_MODULE', module: 'cart' }],
  ['cart band karo', { type: 'CLOSE_MODULE', module: 'cart' }],
]);

table('search', [
  ['Search for noise cancelling headphones', { type: 'OPEN_MODULE', module: 'search', query: 'noise cancelling headphones' }],
  ['search headphones', { type: 'OPEN_MODULE', module: 'search', query: 'headphones' }],
  ['find me a smartwatch', { type: 'OPEN_MODULE', module: 'search', query: 'smartwatch' }],
  ['look for coffee', { type: 'OPEN_MODULE', module: 'search', query: 'coffee' }],
  ['Headphones search karo.', { type: 'OPEN_MODULE', module: 'search', query: 'headphones' }],
  ['headphones dhundo', { type: 'OPEN_MODULE', module: 'search', query: 'headphones' }],
  ['search', { type: 'OPEN_MODULE', module: 'search' }],
  ['find circuit hub', nav(1)],
]);

table('dashboard, about and ledgers', [
  ['Open dashboard', { type: 'OPEN_MODULE', module: 'dashboard' }],
  ['go to merchant studio', { type: 'OPEN_MODULE', module: 'dashboard' }],
  ['manage my stores', { type: 'OPEN_MODULE', module: 'dashboard' }],
  ['open my shop', { type: 'OPEN_MODULE', module: 'dashboard' }],
  ['open about', { type: 'OPEN_MODULE', module: 'about' }],
  ['what is retail sync', { type: 'OPEN_MODULE', module: 'about' }],
  ['Show Kafka ledger', { type: 'OPEN_MODULE', module: 'ledger', service: 'kafka' }],
  ['check PostgreSQL', { type: 'OPEN_MODULE', module: 'ledger', service: 'postgres' }],
  ['how is the database', { type: 'OPEN_MODULE', module: 'ledger', service: 'postgres' }],
  ['open search ledger', { type: 'OPEN_MODULE', module: 'ledger', service: 'opensearch' }],
]);

table('closing and agent control', [
  ['close', { type: 'CLOSE_OVERLAY' }],
  ['Go back', { type: 'CLOSE_OVERLAY' }],
  ['close this', { type: 'CLOSE_OVERLAY' }],
  ['exit the store', { type: 'CLOSE_OVERLAY' }],
  ['band karo', { type: 'CLOSE_OVERLAY' }],
  ['go home', { type: 'CLOSE_OVERLAY' }],
  ['stop', { type: 'STOP' }],
  ['never mind', { type: 'STOP' }],
  ['ruko', { type: 'STOP' }],
  ['Sleep.', { type: 'SLEEP' }],
  ['Sync, go to sleep', { type: 'SLEEP' }],
  ['Soh jaao', { type: 'SLEEP' }],
  ['good night', { type: 'SLEEP' }],
]);

table('starting a store', [
  ['Create a new store called ZenTech', { type: 'CREATE_STORE_INPUT', field: 'name', value: 'Zentech' }],
  ['make a shop named Moss and Co', { type: 'CREATE_STORE_INPUT', field: 'name', value: 'Moss And Co' }],
  ['I want to start a fashion brand', { type: 'CREATE_STORE_INPUT', field: 'name', value: '', category: 'Fashion & Apparel' }],
  ['open a new store', { type: 'CREATE_STORE_INPUT', field: 'name', value: '' }],
  ['naya store banao', { type: 'CREATE_STORE_INPUT', field: 'name', value: '' }],
  ['build an electronics store', { type: 'CREATE_STORE_INPUT', field: 'name', value: '', category: 'Electronics & Tech' }],
  ['set up my business', { type: 'CREATE_STORE_INPUT', field: 'name', value: '' }],
]);

table('the store wizard conversation', [
  ['Zenith', { type: 'CREATE_STORE_INPUT', field: 'name', value: 'Zenith' }],
  ['call it Zenith Labs', { type: 'CREATE_STORE_INPUT', field: 'name', value: 'Zenith Labs' }],
  ['Electronics and tech', { type: 'CREATE_STORE_INPUT', field: 'category', value: 'Electronics & Tech' }],
  ['Aurora', { type: 'CREATE_STORE_INPUT', field: 'theme', value: 'Aurora' }],
  ['open cart', { type: 'OPEN_MODULE', module: 'cart' }],
  ['close', { type: 'CLOSE_OVERLAY' }],
  ['yes', type('CLARIFY')],
], {});

table('wizard with a name', [
  ['the midnight theme please', { type: 'CREATE_STORE_INPUT', field: 'theme', value: 'Midnight' }],
  ['make it fashion', { type: 'CREATE_STORE_INPUT', field: 'category', value: 'Fashion & Apparel' }],
  ['rename it to Nova', { type: 'CREATE_STORE_INPUT', field: 'name', value: 'Nova' }],
  ['Yes, launch it!', { type: 'CREATE_STORE_INPUT', field: 'submit', value: 'yes' }],
  ['deploy store', { type: 'CREATE_STORE_INPUT', field: 'submit', value: 'yes' }],
  ['haan', { type: 'CREATE_STORE_INPUT', field: 'submit', value: 'yes' }],
  ['not yet', type('CLARIFY')],
  ['create a new store', type('CLARIFY')],
], { name: 'Zenith', category: 'Electronics & Tech', theme: 'Aurora' });

table('questions go to the store assistant', [
  ['What is the price of sunglasses?', { type: 'AI_QUERY', query: 'What is the price of sunglasses?' }],
  ['which products are low on stock', type('AI_QUERY')],
  ['how are orders doing', type('AI_QUERY')],
  ['what is 2 plus 2', type('AI_QUERY')],
  ['buy a gift card', type('AI_QUERY')],
]);

table('vague store commands ask which one', [
  ['open store', type('CLARIFY')],
  ['go to the shop', type('CLARIFY')],
]);

describe('replies', () => {
  it('runs the creation conversation in order', () => {
    assert.match(run('Create a new store called ZenTech').reply!, /What type of store is Zentech/);
    assert.match(run('Electronics and tech', { name: 'Zentech' }).reply!, /Which theme/);
    assert.match(run('Aurora', { name: 'Zentech', category: 'Electronics & Tech' }).reply!, /Zentech is ready in Electronics & Tech with the Aurora theme. Shall I launch it now\?/);
  });
  it('says how many stores exist for an out-of-range number', () => {
    assert.match(run('open store 9').reply!, /are 6 stores/);
  });
  it('makes text speakable', () => {
    assert.equal(speakable('**Mug** costs ₹1,299 • 5 left'), 'Mug costs 1299 rupees 5 left');
  });
});

table('search vs the OpenSearch ledger', [
  ['open search for headphones', { type: 'OPEN_MODULE', module: 'search', query: 'headphones' }],
  ['opensearch status', { type: 'OPEN_MODULE', module: 'ledger', service: 'opensearch' }],
  ['search for kafka books', { type: 'OPEN_MODULE', module: 'search', query: 'kafka books' }],
]);

table('recovering common mishearings', [
  ['Next door', { type: 'STEP_STORE', direction: 'next' }],
  ['Next tour', { type: 'STEP_STORE', direction: 'next' }],
  ['Go to the last door', nav(6)],
  ['Kard kholo', { type: 'OPEN_MODULE', module: 'cart' }],
  ['Karth kholo', { type: 'OPEN_MODULE', module: 'cart' }],
  ['Toh number tin kholo', nav(3)],
  ['door number tin kholo.', nav(3)],
  ['So jaao.', { type: 'SLEEP' }],
]);

table('words Gnani glues or bends when hinted', [
  ['OpenStore one.', nav(1)],
  ['OpenStore number two.', nav(2)],
  ['OpenCart.', { type: 'OPEN_MODULE', module: 'cart' }],
  ['Pitchless store. Pitchless store.', { type: 'STEP_STORE', direction: 'previous' }],
  ['Sujav', { type: 'SLEEP' }],
  ['So, Java.', { type: 'SLEEP' }],
  ['Go to CircuitHub', nav(1)],
]);
