/**
 * Spoken transcript -> platform action + what the agent says back (v1.06).
 * Pure and deterministic: the browser executes the action, the server never
 * changes state from voice alone (store creation still goes through the
 * signed-in user's normal createStore call).
 *
 * Input is Gnani's transliterated transcript, so English and Hinglish
 * ("cart kholo", "agla store") arrive in Latin script. Rules are checked in a
 * fixed priority order; anything unmatched goes to the store assistant.
 */
export type Module = 'cart' | 'dashboard' | 'search' | 'about' | 'ledger';
export type LedgerService = 'postgres' | 'kafka' | 'opensearch';
export type CreateField = 'name' | 'category' | 'theme' | 'submit';

export type VoiceAction =
  | { type: 'NAVIGATE_STORE'; storeId: string; storeName: string }
  | { type: 'STEP_STORE'; direction: 'next' | 'previous' }
  | { type: 'OPEN_MODULE'; module: Module; query?: string; service?: LedgerService }
  | { type: 'CLOSE_MODULE'; module: 'cart' }
  | { type: 'CLOSE_OVERLAY' }
  | { type: 'STOP' }
  | { type: 'SLEEP' }
  /** Nothing to do; just say the reply (e.g. "Which store?"). */
  | { type: 'CLARIFY' }
  | { type: 'CREATE_STORE_INPUT'; field: CreateField; value: string; category?: string }
  | { type: 'AI_QUERY'; query: string };

export interface CreateDraft {
  name?: string;
  category?: string;
  theme?: string;
}

export interface IntentContext {
  /** In carousel order, so "store 1" is the first card. */
  stores: { id: string; name: string }[];
  /** Present while the store wizard is open. */
  creating?: CreateDraft | null;
}

export interface IntentResult {
  action: VoiceAction;
  /** Spoken reply; null when the client composes it (AI_QUERY) or nothing should be said. */
  reply: string | null;
}

export const CATEGORIES = [
  { id: 'Fashion & Apparel', words: ['fashion', 'apparel', 'clothing', 'clothes', 'footwear', 'shoes', 'kapde'] },
  { id: 'Electronics & Tech', words: ['electronic', 'electronics', 'tech', 'gadget', 'gadgets', 'technology'] },
  { id: 'Home & Decor', words: ['home', 'decor', 'furniture', 'kitchen', 'living'] },
  { id: 'Food & Beverage', words: ['food', 'beverage', 'beverages', 'drinks', 'grocery', 'groceries', 'pantry', 'coffee', 'khana'] },
  { id: 'Sports & Fitness', words: ['sport', 'sports', 'fitness', 'gym', 'activewear'] },
  { id: 'Books & Stationery', words: ['book', 'books', 'stationery', 'journals'] },
  { id: 'General Retail', words: ['general', 'retail', 'department', 'everything'] },
] as const;
export const THEMES = ['Aurora', 'Sunset', 'Forest', 'Midnight', 'Obsidian'] as const;

/** Hinglish (as Gnani transliterates it) -> the English command words the rules use. */
const HINGLISH: [RegExp, string][] = [
  [/\b(so ja(o|ao|v|av)?|soh ja(o|ao)?|sona hai|sujav|sujao|so java|sojao)\b/g, 'sleep'],
  [/\b(band kar(o| do|iye)?|hata(o| do)|bandh kar(o| do)?)\b/g, 'close'],
  [/\b(khol(o|iye| do| de)?|dikha(o|iye| do)?|chalo|le chalo|jao|par jao|pe jao)\b/g, 'open'],
  [/\b(agla|agle|aage wala)\b/g, 'next'],
  [/\b(pichla|pichhla|pichle|pitchla|pitchless|peeche wala)\b/g, 'previous'],
  [/\b(dhundo|dhoondo|dhundho|khojo|search kar(o|iye| do)?)\b/g, 'search'],
  [/\b(bana(o|iye| do)?)\b/g, 'create'],
  [/\b(naya|nayi|naye)\b/g, 'new'],
  [/\b(ruko|ruk jao|bas karo)\b/g, 'stop'],
  [/\b(haan|haa|haanji|ha ji|theek hai|thik hai)\b/g, 'yes'],
  [/\b(nahi|nahin|mat)\b/g, 'no'],
  [/\b(pehla|pehle)\b/g, 'first'],
  [/\b(tin|tiin)\b/g, 'teen'],
  [/\b(kard|karth|kart)\b/g, 'cart'],
  [/\b(doosra|dusra)\b/g, 'second'],
  [/\b(teesra|tisra)\b/g, 'third'],
];

/** Lowercase words; "&" read as "and", wake phrase removed, Hinglish mapped, "card" heard for "cart" fixed. */
export function normalize(text: string): string {
  let t = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Lumière -> lumiere
    .replace(/\b(Open|Close|Show|Go|View)(?=[A-Z])/g, '$1 ') // Gnani glues hinted words: "OpenStore", "OpenCart"
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(hey\s+sync|retail\s+up|sync)\b\s*/, '');
  for (const [re, word] of HINGLISH) t = t.replace(re, word);
  // Gnani often hears "cart" as "card"; only fix it in a command context, not "gift card".
  t = t.replace(/\b(open|close|view|show|see|check|my|the)\s+card\b/g, '$1 cart').replace(/^card\b/, 'cart').replace(/\bcard\s+(open|close)\b/g, 'cart $1');
  // "store" heard as "door"/"tour"/"stor" next to a number or a direction.
  t = t.replace(/\b(next|previous|last|first|second|third|number|the \w+th)\s+(door|tour|stor|stoor|stores)\b/g, '$1 store').replace(/\b(door|tour|stor)\s+(number|no)\b/g, 'store $2').replace(/^(door|tour|toh)\s+number\b/, 'store number');
  return t.replace(/\s+/g, ' ').trim();
}
const squash = (s: string) => normalize(s).replace(/\s+/g, '');

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

/** Store named in the transcript: exact (spacing-insensitive), else a close spelling ("thread lane"). */
function findStore(t: string, stores: IntentContext['stores']) {
  const said = t.replace(/\s+/g, '');
  const named = [...stores].filter((s) => squash(s.name).length >= 3).sort((a, b) => b.name.length - a.name.length);
  const exact = named.find((s) => said.includes(squash(s.name)));
  if (exact) return exact;
  let best: { store: (typeof stores)[number]; d: number } | null = null;
  for (const s of named) {
    const n = squash(s.name);
    const allowed = n.length >= 9 ? 2 : n.length >= 6 ? 1 : 0;
    if (!allowed) continue;
    for (let len = n.length - allowed; len <= n.length + allowed; len++) {
      for (let i = 0; i + len <= said.length; i++) {
        const d = editDistance(n, said.slice(i, i + len));
        if (d <= allowed && (!best || d < best.d)) best = { store: s, d };
      }
    }
  }
  return best?.store;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  ek: 1, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10,
};
const NUM = '(\\d{1,2}(?:st|nd|rd|th)?|' + Object.keys(NUMBER_WORDS).join('|') + '|last)';
const toNumber = (w: string, count: number) => (w === 'last' ? count : /^\d/.test(w) ? parseInt(w, 10) : NUMBER_WORDS[w] ?? NaN);

/** "store 1", "store number two", "the third store", "3rd one", "last shop" -> 1-based position. */
function findOrdinal(t: string, count: number): number | null {
  const after = new RegExp(`\\b(?:store|shop|card)\\s+(?:number\\s+|no\\s+)?${NUM}\\b`).exec(t);
  const before = new RegExp(`\\b${NUM}\\s+(?:store|shop|card|one)\\b`).exec(t);
  const bare = new RegExp(`^(?:open|go to|show|show me)\\s+(?:number\\s+)${NUM}$`).exec(t);
  const m = after ?? before ?? bare;
  if (!m) return null;
  const n = toNumber(m[1]!.replace(/(st|nd|rd|th)$/, (x) => (/^\d/.test(m[1]!) ? '' : x)), count);
  return Number.isFinite(n) ? n : null;
}

const findCategory = (t: string) => CATEGORIES.find((c) => c.words.some((w) => new RegExp(`\\b${w}\\b`).test(t)))?.id;
const findTheme = (t: string) => THEMES.find((th) => new RegExp(`\\b${th.toLowerCase()}\\b`).test(t));
const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

const ASK_CATEGORY = (name: string) => `What type of store is ${name}? For example Electronics, Fashion, or Home Decor.`;
const ASK_THEME = 'Which theme would you like? We have Aurora, Sunset, Forest, Midnight, and Obsidian.';
const confirm = (d: CreateDraft) => `${d.name ?? 'Your store'} is ready in ${d.category ?? 'General Retail'} with the ${d.theme ?? 'Aurora'} theme. Shall I launch it now?`;

/** The next question in the creation conversation, given what is filled in. */
function nextPrompt(d: CreateDraft): string {
  if (!d.name) return 'What should the store be called?';
  if (!d.category) return ASK_CATEGORY(d.name);
  if (!d.theme) return ASK_THEME;
  return confirm(d);
}

const NAV_VERB = /\b(go|open|show|take|visit|switch|navigate|jump|bring|launch|enter|see|view)\b/;
const CREATE_VERB = /\b(create|make|build|set up|setup|start|launch|register)\b/;
const STORE_NOUN = /\b(store|shop|brand|business|storefront)\b/;

const say = (action: VoiceAction, reply: string | null): IntentResult => ({ action, reply });

/** Explicit answers inside the store wizard (checked before general commands). */
function creationAnswer(t: string, d: CreateDraft): IntentResult | null {
  if (/^(yes|yeah|yep|sure|ok|okay|go ahead|confirm|do it)\b|\b(launch|deploy|publish|go live)\b( it| the store| my store| store| now)?$|\blaunch it\b/.test(t)) {
    if (!d.name) return say({ type: 'CLARIFY' }, 'First, what should the store be called?');
    return say({ type: 'CREATE_STORE_INPUT', field: 'submit', value: 'yes' }, `Launching ${d.name} now.`);
  }
  if (/^(no|nope|not yet|wait)\b/.test(t)) return say({ type: 'CLARIFY' }, 'Okay. Tell me what to change: the name, the category, or the theme.');
  const renamed = /\b(?:call it|name it|rename it(?: to)?|change (?:the )?name to|name should be|name is|named|called)\s+(.+)$/.exec(t);
  if (renamed) {
    const name = titleCase(renamed[1]!.trim());
    return say({ type: 'CREATE_STORE_INPUT', field: 'name', value: name }, `${name}, got it. ${nextPrompt({ ...d, name })}`);
  }
  const theme = findTheme(t);
  if (theme) return say({ type: 'CREATE_STORE_INPUT', field: 'theme', value: theme }, `${theme} it is. ${nextPrompt({ ...d, theme })}`);
  const category = findCategory(t);
  if (category) return say({ type: 'CREATE_STORE_INPUT', field: 'category', value: category }, `${category}, nice. ${nextPrompt({ ...d, category })}`);
  return null;
}

const LEDGER_WORD = /\b(ledger|logs?|status|events?|health|index)\b/;
const SERVICES: [RegExp, RegExp, LedgerService, string][] = [
  [/\bkafka\b/, /\b(ledger|show|check|open|status|events?|logs?|health|how)\b/, 'kafka', 'Kafka'],
  [/\b(postgres|postgresql|postgre|database|sql)\b/, /\b(ledger|show|check|open|status|events?|logs?|health|how)\b/, 'postgres', 'PostgreSQL'],
  // "open search for X" is a search, so OpenSearch needs an explicit ledger word.
  [/\b(open ?search|elastic)\b/, LEDGER_WORD, 'opensearch', 'OpenSearch'],
];

export function classify(transcript: string, ctx: IntentContext): IntentResult {
  const t = normalize(transcript);
  const { stores } = ctx;
  if (!t) return say({ type: 'CLARIFY' }, "Sorry, I didn't catch that.");

  // 1. Agent control.
  if (/^(go to sleep|sleep|good ?night)\b|\b(go to sleep|sleep now)\b|^sleep$/.test(t)) return say({ type: 'SLEEP' }, 'Going to sleep. Say Sync to wake me.');
  if (/^(stop|cancel|never ?mind|be quiet|shut up|quiet|enough)$/.test(t)) return say({ type: 'STOP' }, null);

  // 2. Answers to the store wizard's questions.
  if (ctx.creating) {
    const answer = creationAnswer(t, ctx.creating);
    if (answer) return answer;
  }

  // 3. Closing things.
  if (/\bcart\b/.test(t) && /\b(close|hide|dismiss|exit)\b/.test(t)) return say({ type: 'CLOSE_MODULE', module: 'cart' }, 'Cart closed.');
  if (/^(close|go back|back|escape|exit|dismiss|cancel|home|go home)\b/.test(t) || /\b(close|exit) (this|it|the \w+|everything)$/.test(t)) {
    return say({ type: 'CLOSE_OVERLAY' }, 'Closed.');
  }

  // 4. Creating a store ("open a new store" creates; plain "open store 2" navigates).
  const wantsCreate = STORE_NOUN.test(t) && (CREATE_VERB.test(t) || /\bnew (store|shop|brand|business)\b/.test(t)) && !/\blaunch (store|shop) \S+$/.test(t);
  if (wantsCreate && !findOrdinal(t, stores.length) && !(findStore(t, stores) && !/\bnew\b/.test(t))) {
    if (ctx.creating) return say({ type: 'CLARIFY' }, `We're already building ${ctx.creating.name ?? 'a store'}. ${nextPrompt(ctx.creating)}`);
    const named = /\b(?:called|named|name it|call it)\s+(.+)$/.exec(t);
    const name = named ? titleCase(named[1]!.trim()) : undefined;
    const category = findCategory(t);
    return say({ type: 'CREATE_STORE_INPUT', field: 'name', value: name ?? '', ...(category ? { category } : {}) }, `Let's build it. ${nextPrompt({ name, category })}`);
  }

  // 5. Store by position ("store 1", "third store", "last shop").
  const position = findOrdinal(t, stores.length);
  if (position !== null) {
    const store = stores[position - 1];
    if (!store) return say({ type: 'CLARIFY' }, `There ${stores.length === 1 ? 'is only 1 store' : `are ${stores.length} stores`}. Say a number from 1 to ${stores.length}.`);
    return say({ type: 'NAVIGATE_STORE', storeId: store.id, storeName: store.name }, `Opening ${store.name}.`);
  }

  // 6. Service ledgers (before search, so "open search ledger" isn't a product search).
  for (const [re, verb, service, label] of SERVICES) {
    if (re.test(t) && verb.test(t)) return say({ type: 'OPEN_MODULE', module: 'ledger', service }, `Opening the ${label} ledger.`);
  }

  // 6b. Search ("search for X", "find X", "look for X", "X search").
  const search = /\b(?:search|find|look|looking|searching)\b(?:\s+(?:for|up))?\s+(.+)$/.exec(t) ?? /^(.+?)\s+search$/.exec(t);
  if (search) {
    const query = search[1]!.replace(/^((me|a|an|the|some|for)\s+)+/, '').trim();
    const store = findStore(query, stores);
    if (store && squash(query) === squash(store.name)) return say({ type: 'NAVIGATE_STORE', storeId: store.id, storeName: store.name }, `Opening ${store.name}.`);
    if (query && !/^(store|shop|stores)$/.test(query)) return say({ type: 'OPEN_MODULE', module: 'search', query }, `Searching for ${query}.`);
  }
  if (/^(search|find|open search|search bar)$/.test(t)) return say({ type: 'OPEN_MODULE', module: 'search' }, 'What are you looking for?');

  // 7. Store by name.
  const store = findStore(t, stores);
  if (store && (NAV_VERB.test(t) || STORE_NOUN.test(t) || t.split(' ').length <= 4)) {
    return say({ type: 'NAVIGATE_STORE', storeId: store.id, storeName: store.name }, `Opening ${store.name}.`);
  }

  // 8. Platform modules.
  if (/\b(cart|basket|bag)\b/.test(t)) return say({ type: 'OPEN_MODULE', module: 'cart' }, 'Here is your cart.');
  if (/\b(dashboard|merchant studio|studio|admin|my stores?|my shops?|manage)\b/.test(t)) return say({ type: 'OPEN_MODULE', module: 'dashboard' }, 'Opening your dashboard.');
  if (/\babout\b|\bwhat is retail ?sync\b/.test(t)) return say({ type: 'OPEN_MODULE', module: 'about' }, 'Here is RetailSync.');

  // 9. Stepping through the carousel.
  if (/^(next|forward)$|\b(next|forward)\b.*\b(store|shop|one|card)\b|\bgo next\b/.test(t)) return say({ type: 'STEP_STORE', direction: 'next' }, null);
  if (/^(previous|prev)$|\b(previous|prev|before)\b.*\b(store|shop|one|card)\b|\bgo previous\b/.test(t)) return say({ type: 'STEP_STORE', direction: 'previous' }, null);

  // 10. A store-ish command we couldn't resolve.
  if (STORE_NOUN.test(t) && NAV_VERB.test(t) && t.split(' ').length <= 4) {
    return say({ type: 'CLARIFY' }, `Which store? Say a name like ${stores[0]?.name ?? 'CircuitHub'}, or a number like store 2.`);
  }

  // 11. The wizard is waiting for a name and this sounds like one.
  if (ctx.creating && !ctx.creating.name && t.split(' ').length <= 4 && !/\?$/.test(transcript.trim())) {
    const name = titleCase(t);
    return say({ type: 'CREATE_STORE_INPUT', field: 'name', value: name }, `${name}, got it. ${nextPrompt({ ...ctx.creating, name })}`);
  }

  // 12. Everything else is a question for the store assistant.
  return say({ type: 'AI_QUERY', query: transcript.trim() }, null);
}
