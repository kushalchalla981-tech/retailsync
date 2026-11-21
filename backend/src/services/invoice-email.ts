/**
 * Payment invoices after each verified Razorpay payment (v1.05: two recipients).
 *   - owner: payout summary to the platform owner (INVOICE_EMAIL_TO, default the owner)
 *   - buyer: tax receipt to the shopper's email, when they gave one
 *
 * Sent with Resend's HTTP API (no SDK). Configuration:
 *   RESEND_API_KEY      required to send; when unset, invoices are logged and skipped
 *   INVOICE_EMAIL_TO    owner recipient (default: the platform owner)
 *   INVOICE_EMAIL_FROM  sender (default: Resend's shared test sender, which can only
 *                       deliver to the Resend account's own email address, so buyer
 *                       receipts need a verified domain)
 */
import { loadDotEnv } from '../config.js';

export const PLATFORM_OWNER_EMAIL = 'kushalchalla981@gmail.com';

export interface InvoiceLine {
  name: string;
  storeName: string;
  qty: number;
  unitPriceInr: number;
}

export interface Invoice {
  orderId: string;
  paymentId: string;
  /** Amount Razorpay actually captured for the order, in paise. Source of truth for the total. */
  paidPaise: number;
  currency: string;
  lines: InvoiceLine[];
  customerName?: string;
  customerEmail?: string;
  issuedAt: Date;
  /** Units paid for that were already sold out when the payment was committed (owner must refund). */
  shortfalls?: { name: string; missing: number }[];
}

export type Audience = 'owner' | 'buyer';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const inr = (rupees: number) => `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function renderInvoice(inv: Invoice, audience: Audience = 'owner'): { subject: string; html: string; text: string } {
  const paid = inv.paidPaise / 100;
  const itemsTotal = inv.lines.reduce((n, l) => n + l.qty * l.unitPriceInr, 0);
  const shipping = Math.max(0, Math.round((paid - itemsTotal) * 100) / 100);
  const mismatch = itemsTotal > paid;
  const rows = inv.lines
    .map((l) => `<tr><td>${esc(l.name)}<br><small>${esc(l.storeName)}</small></td><td align="center">${l.qty}</td><td align="right">${inr(l.unitPriceInr)}</td><td align="right">${inr(l.qty * l.unitPriceInr)}</td></tr>`)
    .join('');
  const when = inv.issuedAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const stores = [...new Set(inv.lines.map((l) => l.storeName))].join(', ');
  const buyer = audience === 'buyer';
  const subject = buyer ? `Your RetailSync receipt from ${stores}: ${inr(paid)}` : `RetailSync invoice ${inv.paymentId}: ${inr(paid)}`;
  const short = inv.shortfalls?.length ? inv.shortfalls : null;
  const ownerNotes = buyer
    ? ''
    : `<p><b>GMV:</b> ${inr(paid)} · <b>Stores:</b> ${esc(stores)} · <b>Payout status:</b> captured, settles via Razorpay</p>${
        short ? `<p style="color:#c0392b"><b>Refund needed:</b> ${short.map((s) => `${s.missing} × ${esc(s.name)}`).join(', ')} sold out before this payment committed.</p>` : ''
      }`;
  const buyerNotes = buyer
    ? `<p style="color:#786f66">Thank you for shopping with ${esc(stores)} on RetailSync. Questions about this order? Reply to this email or write to ${PLATFORM_OWNER_EMAIL}.</p>`
    : '';
  const html = `<div style="font-family:Arial,sans-serif;color:#1a1918;max-width:640px">
<h2 style="margin:0 0 4px">RetailSync · ${buyer ? 'Tax invoice / receipt' : 'Payment received'}</h2>
<p style="margin:0 0 16px;color:#786f66">${esc(when)}</p>
<p><b>Payment:</b> ${esc(inv.paymentId)}<br><b>Razorpay order:</b> ${esc(inv.orderId)}${inv.customerName || inv.customerEmail ? `<br><b>Customer:</b> ${esc(inv.customerName ?? '')} ${inv.customerEmail ? `&lt;${esc(inv.customerEmail)}&gt;` : ''}` : ''}</p>
<table width="100%" cellpadding="6" style="border-collapse:collapse;border-top:2px solid #1a1918;border-bottom:2px solid #1a1918">
<tr style="background:#f4f0ed"><th align="left">Item</th><th>Qty</th><th align="right">Unit</th><th align="right">Amount</th></tr>${rows}
${shipping > 0 && !mismatch ? `<tr><td colspan="3" align="right">Shipping</td><td align="right">${inr(shipping)}</td></tr>` : ''}
<tr><td colspan="3" align="right"><b>Total paid (verified by Razorpay)</b></td><td align="right"><b>${inr(paid)} ${esc(inv.currency)}</b></td></tr>
</table>
${mismatch && !buyer ? `<p style="color:#c0392b"><b>Check this payment:</b> items listed by the shopper add up to ${inr(itemsTotal)}, more than the ${inr(paid)} Razorpay captured.</p>` : ''}
${ownerNotes}${buyerNotes}
<p style="color:#9a938d;font-size:12px">Prices include GST.</p>
</div>`;
  const text = [
    buyer ? `Your RetailSync receipt from ${stores} (${when})` : `RetailSync payment received (${when})`,
    `Payment ${inv.paymentId} · order ${inv.orderId}`,
    ...inv.lines.map((l) => `${l.qty} x ${l.name} (${l.storeName}) @ ${inr(l.unitPriceInr)}`),
    `Total paid (verified by Razorpay): ${inr(paid)} ${inv.currency}`,
    ...(mismatch && !buyer ? [`WARNING: listed items total ${inr(itemsTotal)}, more than the amount paid.`] : []),
    ...(short && !buyer ? [`REFUND NEEDED: ${short.map((x) => `${x.missing} x ${x.name}`).join(', ')} sold out first.`] : []),
    ...(buyer ? [`Questions? Write to ${PLATFORM_OWNER_EMAIL}.`] : []),
  ].join('\n');
  return { subject, html, text };
}

export type DeliveryStatus = 'sent' | 'skipped' | 'failed';
export interface InvoiceDelivery {
  owner: DeliveryStatus;
  buyer: DeliveryStatus;
}
export type InvoiceSender = (inv: Invoice) => Promise<InvoiceDelivery>;

async function sendOne(key: string, to: string, inv: Invoice, audience: Audience, replyTo?: string): Promise<void> {
  const { subject, html, text } = renderInvoice(inv, audience);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.INVOICE_EMAIL_FROM?.trim() || 'RetailSync <onboarding@resend.dev>',
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** Sends the owner summary and the buyer receipt independently; one failing never blocks the other. */
export const sendInvoiceEmail: InvoiceSender = async (inv) => {
  loadDotEnv();
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { owner: 'skipped', buyer: 'skipped' };
  const attempt = async (fn: () => Promise<void>): Promise<DeliveryStatus> => {
    try {
      await fn();
      return 'sent';
    } catch (err) {
      console.error('[invoice-email]', err instanceof Error ? err.message : err);
      return 'failed';
    }
  };
  const ownerTo = process.env.INVOICE_EMAIL_TO?.trim() || PLATFORM_OWNER_EMAIL;
  const [owner, buyer] = await Promise.all([
    attempt(() => sendOne(key, ownerTo, inv, 'owner', inv.customerEmail)),
    inv.customerEmail ? attempt(() => sendOne(key, inv.customerEmail!, inv, 'buyer', PLATFORM_OWNER_EMAIL)) : Promise.resolve<DeliveryStatus>('skipped'),
  ]);
  return { owner, buyer };
};
