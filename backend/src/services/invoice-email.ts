/**
 * Payment invoices, emailed to the platform owner after each verified Razorpay payment.
 *
 * Sent with Resend's HTTP API (no SDK). Configuration:
 *   RESEND_API_KEY      required to send; when unset, invoices are logged and skipped
 *   INVOICE_EMAIL_TO    recipient (default: the platform owner)
 *   INVOICE_EMAIL_FROM  sender (default: Resend's shared test sender, which can only
 *                       deliver to the Resend account's own email address)
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
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const inr = (rupees: number) => `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function renderInvoice(inv: Invoice): { subject: string; html: string; text: string } {
  const paid = inv.paidPaise / 100;
  const itemsTotal = inv.lines.reduce((n, l) => n + l.qty * l.unitPriceInr, 0);
  const shipping = Math.max(0, Math.round((paid - itemsTotal) * 100) / 100);
  const mismatch = itemsTotal > paid;
  const rows = inv.lines
    .map((l) => `<tr><td>${esc(l.name)}<br><small>${esc(l.storeName)}</small></td><td align="center">${l.qty}</td><td align="right">${inr(l.unitPriceInr)}</td><td align="right">${inr(l.qty * l.unitPriceInr)}</td></tr>`)
    .join('');
  const when = inv.issuedAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const subject = `RetailSync invoice ${inv.paymentId}: ${inr(paid)}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#1a1918;max-width:640px">
<h2 style="margin:0 0 4px">RetailSync · Payment invoice</h2>
<p style="margin:0 0 16px;color:#786f66">${esc(when)}</p>
<p><b>Payment:</b> ${esc(inv.paymentId)}<br><b>Razorpay order:</b> ${esc(inv.orderId)}${inv.customerName || inv.customerEmail ? `<br><b>Customer:</b> ${esc(inv.customerName ?? '')} ${inv.customerEmail ? `&lt;${esc(inv.customerEmail)}&gt;` : ''}` : ''}</p>
<table width="100%" cellpadding="6" style="border-collapse:collapse;border-top:2px solid #1a1918;border-bottom:2px solid #1a1918">
<tr style="background:#f4f0ed"><th align="left">Item</th><th>Qty</th><th align="right">Unit</th><th align="right">Amount</th></tr>${rows}
${shipping > 0 && !mismatch ? `<tr><td colspan="3" align="right">Shipping</td><td align="right">${inr(shipping)}</td></tr>` : ''}
<tr><td colspan="3" align="right"><b>Total paid (verified by Razorpay)</b></td><td align="right"><b>${inr(paid)} ${esc(inv.currency)}</b></td></tr>
</table>
${mismatch ? `<p style="color:#c0392b"><b>Check this payment:</b> items listed by the shopper add up to ${inr(itemsTotal)}, more than the ${inr(paid)} Razorpay captured.</p>` : ''}
</div>`;
  const text = [
    `RetailSync payment invoice (${when})`,
    `Payment ${inv.paymentId} · order ${inv.orderId}`,
    ...inv.lines.map((l) => `${l.qty} x ${l.name} (${l.storeName}) @ ${inr(l.unitPriceInr)}`),
    `Total paid (verified by Razorpay): ${inr(paid)} ${inv.currency}`,
    ...(mismatch ? [`WARNING: listed items total ${inr(itemsTotal)}, more than the amount paid.`] : []),
  ].join('\n');
  return { subject, html, text };
}

export type InvoiceSender = (inv: Invoice) => Promise<'sent' | 'skipped'>;

/** Sends via Resend; resolves 'skipped' when RESEND_API_KEY is not configured, throws on delivery errors. */
export const sendInvoiceEmail: InvoiceSender = async (inv) => {
  loadDotEnv();
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return 'skipped';
  const { subject, html, text } = renderInvoice(inv);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.INVOICE_EMAIL_FROM?.trim() || 'RetailSync <onboarding@resend.dev>',
      to: [process.env.INVOICE_EMAIL_TO?.trim() || PLATFORM_OWNER_EMAIL],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return 'sent';
};
