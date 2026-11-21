/**
 * Spoken transcript -> platform action + what the agent says back (v1.06).
 * Pure and deterministic: the browser executes the action, the server never
 * changes state from voice alone (store creation still goes through the
 * signed-in user's normal createStore call).
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
  | { type: 'CREATE_STORE_INPUT'; field: CreateField; value: string; category?: string }
  | { type: 'AI_QUERY'; query: string };

export interface CreateDraft {
  name?: string;
  category?: string;
  theme?: string;
}

export interface IntentContext {
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
  { id: 'Fashion & Apparel', words: ['fashion', 'apparel', 'clothing', 'clothes', 'footwear', 'shoes'] },
  { id: 'Electronics & Tech', words: ['electronic', 'electronics', 'tech', 'gadget', 'gadgets', 'technology'] },
  { id: 'Home & Decor', words: ['home', 'decor', 'furniture', 'kitchen', 'living'] },
  { id: 'Food & Beverage', words: ['food', 'beverage', 'beverages', 'drinks', 'grocery', 'pantry', 'coffee'] },
  { id: 'Sports & Fitness', words: ['sport', 'sports', 'fitness', 'gym', 'activewear'] },
  { id: 'Books & Stationery', words: ['book', 'books', 'stationery', 'journals'] },
  { id: 'General Retail', words: ['general', 'retail', 'department', 'everything'] },
] as const;
export const THEMES = ['Aurora', 'Sunset', 'Forest', 'Midnight', 'Obsidian'] as const;

/** Lowercase words; "&" read as "and", wake phrases removed. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/^\s*(hey\s+sync|retail\s+up|sync)\b/, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const squash = (s: string) => normalize(s).replace(/\s+/g, '');

function findStore(text: string, stores: IntentContext['stores']) {
  const said = squash(text);
  // Longest name first so "Peel & Pour" beats a store called "Peel".
  return [...stores].sort((a, b) => b.name.length - a.name.length).find((s) => squash(s.name).length >= 3 && said.includes(squash(s.name)));
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

function creationTurn(t: string, d: CreateDraft): IntentResult | null {
  if (/\b(yes|yeah|yep|launch|deploy|go live|publish|create it|do it|confirm)\b/.test(t) && d.name) {
    return { action: { type: 'CREATE_STORE_INPUT', field: 'submit', value: 'yes' }, reply: `Launching ${d.name} now.` };
  }
  const renamed = /\b(?:call it|name it|named|called|name is)\s+(.+)$/.exec(t);
  if (renamed) {
    const name = titleCase(renamed[1]!.trim());
    return { action: { type: 'CREATE_STORE_INPUT', field: 'name', value: name }, reply: `${name}, got it. ${nextPrompt({ ...d, name })}` };
  }
  const theme = findTheme(t);
  if (theme) return { action: { type: 'CREATE_STORE_INPUT', field: 'theme', value: theme }, reply: `${theme} it is. ${nextPrompt({ ...d, theme })}` };
  const category = findCategory(t);
  if (category) return { action: { type: 'CREATE_STORE_INPUT', field: 'category', value: category }, reply: `${category}, nice. ${nextPrompt({ ...d, category })}` };
  if (!d.name && t.split(' ').length <= 4) {
    const name = titleCase(t);
    return { action: { type: 'CREATE_STORE_INPUT', field: 'name', value: name }, reply: `${name}, got it. ${nextPrompt({ ...d, name })}` };
  }
  return null;
}

const SERVICES: [RegExp, LedgerService][] = [
  [/\bkafka\b/, 'kafka'],
  [/\b(postgres|postgresql|postgre|database)\b/, 'postgres'],
  [/\b(open ?search|search index)\b/, 'opensearch'],
];

export function classify(transcript: string, ctx: IntentContext): IntentResult {
  const t = normalize(transcript);
  if (!t) return { action: { type: 'STOP' }, reply: "Sorry, I didn't catch that." };

  if (/^(go to sleep|sleep|good ?night)\b|\b(go to sleep|sleep now)\b/.test(t)) return { action: { type: 'SLEEP' }, reply: 'Going to sleep. Say Sync to wake me.' };
  if (/^(stop|cancel|never ?mind|be quiet|shut up|quiet)\b/.test(t)) return { action: { type: 'STOP' }, reply: null };
  if (/^(close|go back|back|escape|exit|dismiss)\b/.test(t) && !/\bcart\b/.test(t)) return { action: { type: 'CLOSE_OVERLAY' }, reply: 'Closed.' };

  // Starting a store works from anywhere.
  const create = /\b(?:create|make|build|start|launch|open)\b.*?\b(?:store|shop|brand|business)\b(?:\s+(?:called|named)\s+(.+))?/.exec(t);
  if (create && !ctx.creating) {
    const name = create[1] ? titleCase(create[1].trim()) : undefined;
    const category = findCategory(t);
    const draft = { name, category };
    return {
      action: { type: 'CREATE_STORE_INPUT', field: 'name', value: name ?? '', ...(category ? { category } : {}) },
      reply: `Let's build it. ${nextPrompt(draft)}`,
    };
  }
  if (ctx.creating) {
    const turn = creationTurn(t, ctx.creating);
    if (turn) return turn;
  }

  if (/\bcart\b/.test(t)) {
    if (/\b(close|hide|dismiss)\b/.test(t)) return { action: { type: 'CLOSE_MODULE', module: 'cart' }, reply: 'Cart closed.' };
    return { action: { type: 'OPEN_MODULE', module: 'cart' }, reply: 'Here is your cart.' };
  }
  const search = /\b(?:search|look|find|looking)\b(?:\s+(?:for|up))?\s+(.+)$/.exec(t);
  if (search && !/\bstore\b/.test(search[1]!)) {
    const query = search[1]!.trim();
    return { action: { type: 'OPEN_MODULE', module: 'search', query }, reply: `Searching for ${query}.` };
  }
  if (/\b(dashboard|merchant studio|studio|admin)\b/.test(t)) return { action: { type: 'OPEN_MODULE', module: 'dashboard' }, reply: 'Opening your dashboard.' };
  for (const [re, service] of SERVICES) {
    if (re.test(t) && /\b(ledger|show|check|open|status|events|logs?)\b/.test(t)) {
      return { action: { type: 'OPEN_MODULE', module: 'ledger', service }, reply: `Opening the ${service === 'postgres' ? 'PostgreSQL' : service === 'kafka' ? 'Kafka' : 'OpenSearch'} ledger.` };
    }
  }
  if (/\babout\b/.test(t)) return { action: { type: 'OPEN_MODULE', module: 'about' }, reply: 'Here is RetailSync.' };
  if (/\b(next|forward)\b.*\b(store|shop|one)\b|^next$/.test(t)) return { action: { type: 'STEP_STORE', direction: 'next' }, reply: null };
  if (/\b(previous|prev|last|back)\b.*\b(store|shop|one)\b|^previous$/.test(t)) return { action: { type: 'STEP_STORE', direction: 'previous' }, reply: null };

  const store = findStore(t, ctx.stores);
  if (store && (/\b(go|open|show|take|visit|switch|navigate)\b/.test(t) || squash(t) === squash(store.name))) {
    return { action: { type: 'NAVIGATE_STORE', storeId: store.id, storeName: store.name }, reply: `Opening ${store.name}.` };
  }

  return { action: { type: 'AI_QUERY', query: transcript.trim() }, reply: null };
}
