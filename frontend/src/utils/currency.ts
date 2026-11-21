/** Prices are stored in INR. These are indicative display rates (INR per 1 unit), not live FX. */
export const CURRENCIES = {
  INR: { symbol: '₹', label: 'Indian Rupee', perUnit: 1, locale: 'en-IN' },
  USD: { symbol: '$', label: 'US Dollar', perUnit: 84, locale: 'en-US' },
  EUR: { symbol: '€', label: 'Euro', perUnit: 90, locale: 'de-DE' },
  GBP: { symbol: '£', label: 'British Pound', perUnit: 107, locale: 'en-GB' },
  JPY: { symbol: '¥', label: 'Japanese Yen', perUnit: 0.55, locale: 'ja-JP' },
  CAD: { symbol: 'CA$', label: 'Canadian Dollar', perUnit: 60, locale: 'en-CA' },
  AUD: { symbol: 'AU$', label: 'Australian Dollar', perUnit: 55, locale: 'en-AU' },
  SGD: { symbol: 'SG$', label: 'Singapore Dollar', perUnit: 63, locale: 'en-SG' },
  AED: { symbol: 'AED', label: 'UAE Dirham', perUnit: 23, locale: 'en-AE' },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

/** "₹8,999" -> 8999. Numbers pass through. */
export function parseInr(price: string | number): number {
  if (typeof price === 'number') return price;
  const n = Number(price.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(inr: string | number, code: CurrencyCode): string {
  const c = CURRENCIES[code];
  const value = parseInr(inr) / c.perUnit;
  const digits = code === 'INR' || code === 'JPY' ? 0 : 2;
  const num = value.toLocaleString(c.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return code === 'AED' ? `AED ${num}` : `${c.symbol}${num}`;
}
