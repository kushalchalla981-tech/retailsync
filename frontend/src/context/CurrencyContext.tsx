import React, { createContext, useCallback, useContext, useState } from 'react';
import { CURRENCIES, CurrencyCode, formatMoney } from '../utils/currency';

interface CurrencyValue {
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  /** Format an INR amount ("₹8,999" or 8999) in the selected currency. */
  format: (inr: string | number) => string;
}

const KEY = 'retailsync_currency';
const Ctx = createContext<CurrencyValue | null>(null);

function initial(): CurrencyCode {
  try {
    const v = localStorage.getItem(KEY);
    if (v && v in CURRENCIES) return v as CurrencyCode;
  } catch { /* storage unavailable */ }
  return 'INR';
}

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currency, setState] = useState<CurrencyCode>(initial);
  const setCurrency = useCallback((c: CurrencyCode) => {
    setState(c);
    try { localStorage.setItem(KEY, c); } catch { /* ignore */ }
  }, []);
  const format = useCallback((inr: string | number) => formatMoney(inr, currency), [currency]);
  return <Ctx.Provider value={{ currency, setCurrency, format }}>{children}</Ctx.Provider>;
};

export function useCurrency(): CurrencyValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCurrency must be used inside CurrencyProvider');
  return v;
}
