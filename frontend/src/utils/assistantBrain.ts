/**
 * Domain-constrained answers for the dashboard AI Assistant (v1.05).
 * Everything is computed from the store's live catalog, its orders, and the
 * real telemetry ledger; anything outside store intelligence is refused.
 */
import { parseInr } from './currency';
import type { TelemetryEvent } from './telemetry';

export const GUARDRAIL_MESSAGE =
  "⚠️ RetailSync AI is dedicated exclusively to store intelligence. I can only assist with product pricing, inventory levels, orders, storefront customization, and cloud infrastructure. Please ask a store-related question, such as 'What is the price of sunglasses?' or 'Which products are low on stock?'";

export interface BrainProduct { id: string; name: string; price: string; stock: number; category?: string }
export interface BrainOrder { total: string; status: string; items: { quantity: number }[] }
export interface BrainContext {
  storeName: string;
  category: string;
  tagline: string;
  catalog: BrainProduct[];
  orders: BrainOrder[];
  telemetry: TelemetryEvent[];
  baseline: number;
  topline: number;
}
export interface BrainReply { text: string; badge: string; refused?: boolean }

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// Off-topic signals win over everything: arithmetic, trivia, weather, general coding, chit-chat.
const OFF_TOPIC = [
  /^[\s\d+\-*/x×÷^().=?%]+$/i,
  /\b(what|whats|what's|calculate|solve|compute)\b[^a-z]*\d+\s*[-+*/x×÷^]\s*\d+/i,
  /\b(weather|temperature|forecast|rain)\b/i,
  /\b(capital of|president|prime minister|who (is|was|won)|history of|population of|world cup|cricket score|movie|song|lyrics|celebrity)\b/i,
  /\b(joke|poem|story|riddle|recipe|horoscope|meaning of life)\b/i,
  /\b(python|javascript|java|c\+\+|leetcode|algorithm|regex|sql query|write (a|some) code|debug my)\b/i,
  /\b(translate|homework|essay)\b/i,
];

const PRICE = /\b(price|prices|cost|costs|how much|cheap|cheapest|expensive|priciest|under|below|over|above|budget)\b|₹|\brs\.?\b|\binr\b/i;
const STOCK = /\b(stock|stocks|inventory|low|restock|replenish|units?|sold out|available|availability|baseline|capacity|top ?line|oversell)\b/i;
const ORDERS = /\b(orders?|revenue|sales|gmv|settle(ment|d)?|performance|perform|customers?|aov|shipped|delivered|processing|refunds?)\b/i;
const MARKETING = /\b(banner|tagline|announcement|copy|slogan|headline|theme|colou?rs?|marketing|promo|promotion|discount|campaign|flash sale|sale)\b/i;
const INFRA = /\b(kafka|postgres|postgresql|opensearch|aiven|latency|lag|infra|infrastructure|row locks?|locks?|search index|telemetry|database|topic|events?|health|uptime)\b/i;

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** Products mentioned by name (any distinctive word, singular or plural). */
function mentioned(text: string, catalog: BrainProduct[]): BrainProduct[] {
  const asked = new Set(words(text).flatMap((w) => [w, w.replace(/e?s$/, '')]));
  return catalog.filter((p) => words(p.name).some((w) => w.length >= 4 && (asked.has(w) || asked.has(w.replace(/e?s$/, '')))));
}

function priceAnswer(text: string, ctx: BrainContext): BrainReply | null {
  const named = mentioned(text, ctx.catalog);
  if (named.length) {
    return { badge: 'Catalog & Pricing', text: named.map((p) => `"${p.name}" costs ${p.price} (${p.stock > 0 ? `${p.stock} in stock` : 'sold out'}).`).join('\n') };
  }
  const limit = /(?:under|below|less than|within|upto|up to)\s*(?:₹|rs\.?|inr)?\s*([\d,]+)/i.exec(text);
  const floor = /(?:over|above|more than)\s*(?:₹|rs\.?|inr)?\s*([\d,]+)/i.exec(text);
  const priced = ctx.catalog.map((p) => ({ p, v: parseInr(p.price) }));
  if (limit || floor) {
    const max = limit ? Number(limit[1].replace(/,/g, '')) : Infinity;
    const min = floor ? Number(floor[1].replace(/,/g, '')) : -Infinity;
    const hits = priced.filter(({ v }) => v <= max && v >= min).sort((a, b) => a.v - b.v);
    const range = limit && floor ? `between ${inr(min)} and ${inr(max)}` : limit ? `under ${inr(max)}` : `over ${inr(min)}`;
    return {
      badge: 'Catalog & Pricing',
      text: hits.length ? `${hits.length} product(s) ${range} in ${ctx.storeName}:\n${hits.map(({ p }) => `• ${p.name}: ${p.price}`).join('\n')}` : `No products ${range} in ${ctx.storeName}.`,
    };
  }
  if (!PRICE.test(text) || !priced.length) return null;
  const sorted = [...priced].sort((a, b) => a.v - b.v);
  const avg = priced.reduce((n, x) => n + x.v, 0) / priced.length;
  return {
    badge: 'Catalog & Pricing',
    text: `${ctx.storeName} lists ${priced.length} products from ${sorted[0].p.price} (${sorted[0].p.name}) to ${sorted[sorted.length - 1].p.price} (${sorted[sorted.length - 1].p.name}); average ${inr(avg)}.`,
  };
}

function stockAnswer(text: string, ctx: BrainContext): BrainReply {
  const named = mentioned(text, ctx.catalog);
  if (named.length) return { badge: 'Inventory & Stock', text: named.map((p) => `"${p.name}": ${p.stock} units${p.stock <= ctx.baseline ? ` (at or below the ${ctx.baseline}-unit safety baseline)` : ''}.`).join('\n') };
  const low = ctx.catalog.filter((p) => p.stock <= ctx.baseline).sort((a, b) => a.stock - b.stock);
  const total = ctx.catalog.reduce((n, p) => n + p.stock, 0);
  const head = `${ctx.storeName} holds ${total} units across ${ctx.catalog.length} products (safety baseline ${ctx.baseline}, top line ${ctx.topline}).`;
  return {
    badge: 'Inventory & Stock',
    text: low.length
      ? `${head}\n${low.length} product(s) at or below baseline:\n${low.map((p) => `• ${p.name}: ${p.stock === 0 ? 'SOLD OUT' : `${p.stock} units`}`).join('\n')}\nRestock these first; checkout locks stock rows so they can never oversell.`
      : `${head}\nEverything is above the baseline.`,
  };
}

function ordersAnswer(ctx: BrainContext): BrainReply {
  if (!ctx.orders.length) return { badge: 'Orders & Performance', text: `${ctx.storeName} has no orders yet.` };
  const revenue = ctx.orders.filter((o) => o.status !== 'Cancelled').reduce((n, o) => n + parseInr(o.total), 0);
  const units = ctx.orders.reduce((n, o) => n + o.items.reduce((m, i) => m + i.quantity, 0), 0);
  const byStatus = ctx.orders.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.status]: (acc[o.status] ?? 0) + 1 }), {});
  return {
    badge: 'Orders & Performance',
    text: `${ctx.storeName}: ${ctx.orders.length} orders, ${units} units, ${inr(revenue)} revenue (excluding cancelled), average order ${inr(revenue / Math.max(1, ctx.orders.filter((o) => o.status !== 'Cancelled').length))}.\nStatus: ${Object.entries(byStatus).map(([s, n]) => `${s} ${n}`).join(' · ')}.`,
  };
}

function marketingAnswer(text: string, ctx: BrainContext): BrainReply {
  const top = [...ctx.catalog].sort((a, b) => b.stock - a.stock)[0];
  if (/\b(theme|colou?rs?)\b/i.test(text)) {
    return { badge: 'Storefront Marketing', text: `For a ${ctx.category} store, try the Midnight or Obsidian theme for premium products, Aurora for bright everyday goods. Keep the accent colour for buttons and price tags only, so calls to action stand out. Change it under Customize.` };
  }
  return {
    badge: 'Storefront Marketing',
    text: `Ideas for ${ctx.storeName}:\n1. Tagline: "${ctx.tagline || `${ctx.category}, done right`}". Keep it under 8 words.\n2. Banner: "⚡ This week only: free express shipping on ${ctx.category.toLowerCase()} orders over ₹999."${top ? `\n3. Spotlight "${top.name}" (${top.stock} in stock): "${top.name}, now ${top.price}. Ships today."` : ''}`,
  };
}

function infraAnswer(ctx: BrainContext): BrainReply {
  if (!ctx.telemetry.length) {
    return { badge: 'Aiven Infrastructure', text: 'No events in the live ledger yet. Events appear when a payment commits or stock changes. Open About → a service card to watch them stream.' };
  }
  const lines = (['postgres', 'kafka', 'opensearch'] as const).map((svc) => {
    const ev = ctx.telemetry.filter((e) => e.service === svc);
    const lat = ev.filter((e) => typeof e.latencyMs === 'number').map((e) => e.latencyMs!);
    const name = svc === 'postgres' ? 'PostgreSQL' : svc === 'kafka' ? 'Kafka' : 'OpenSearch';
    if (!ev.length) return `• ${name}: no events in this session.`;
    return `• ${name}: ${ev.length} events, last "${ev[ev.length - 1].message}"${lat.length ? `, median latency ${lat.sort((a, b) => a - b)[Math.floor(lat.length / 2)]} ms` : ''}.`;
  });
  return { badge: 'Aiven Infrastructure', text: `Live ledger (this session):\n${lines.join('\n')}` };
}

export function answer(question: string, ctx: BrainContext): BrainReply {
  const text = question.trim();
  if (!text || OFF_TOPIC.some((r) => r.test(text))) return { text: GUARDRAIL_MESSAGE, badge: 'Guardrail', refused: true };
  if (INFRA.test(text)) return infraAnswer(ctx);
  if (STOCK.test(text)) return stockAnswer(text, ctx);
  if (ORDERS.test(text) && !/\bflash sale\b/i.test(text)) return ordersAnswer(ctx);
  if (MARKETING.test(text)) return marketingAnswer(text, ctx);
  const price = priceAnswer(text, ctx);
  if (price) return price;
  return { text: GUARDRAIL_MESSAGE, badge: 'Guardrail', refused: true };
}
