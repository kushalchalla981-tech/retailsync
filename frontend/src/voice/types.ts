/** Mirrors backend/src/voice/intent.ts. */
export type LedgerService = 'postgres' | 'kafka' | 'opensearch';
export type VoiceAction =
  | { type: 'NAVIGATE_STORE'; storeId: string; storeName: string }
  | { type: 'STEP_STORE'; direction: 'next' | 'previous' }
  | { type: 'OPEN_MODULE'; module: 'cart' | 'dashboard' | 'search' | 'about' | 'ledger'; query?: string; service?: LedgerService }
  | { type: 'CLOSE_MODULE'; module: 'cart' }
  | { type: 'CLOSE_OVERLAY' }
  | { type: 'STOP' }
  | { type: 'SLEEP' }
  | { type: 'CLARIFY' }
  | { type: 'CREATE_STORE_INPUT'; field: 'name' | 'category' | 'theme' | 'submit'; value: string; category?: string }
  | { type: 'AI_QUERY'; query: string };

export interface CreateDraft { name?: string; category?: string; theme?: string }

/** Store-wizard actions travel on a window event so the wizard owns its own state. */
const CREATE_EVENT = 'retailsync:voice-create';
export const emitCreateInput = (a: Extract<VoiceAction, { type: 'CREATE_STORE_INPUT' }>) => window.dispatchEvent(new CustomEvent(CREATE_EVENT, { detail: a }));
export function onCreateInput(fn: (a: Extract<VoiceAction, { type: 'CREATE_STORE_INPUT' }>) => void) {
  const h = (e: Event) => fn((e as CustomEvent).detail);
  window.addEventListener(CREATE_EVENT, h);
  return () => window.removeEventListener(CREATE_EVENT, h);
}

/** What the open wizard has explicitly been given (null when closed), sent as intent context. */
let draft: CreateDraft | null = null;
export const setCreateDraft = (d: CreateDraft | null) => { draft = d; };
export const getCreateDraft = () => draft;
