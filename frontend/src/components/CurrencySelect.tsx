import React from 'react';
import { useCurrency } from '../context/CurrencyContext';
import { CURRENCIES, CurrencyCode } from '../utils/currency';

/** Global display-currency picker (prices are always charged in INR). */
export const CurrencySelect: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { currency, setCurrency } = useCurrency();
  return (
    <>
      <label className="sr-only" htmlFor="currency">Currency</label>
      <select
        id="currency"
        value={currency}
        onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
        className={`bg-[#fdfaf6] border border-[#1a1918] rounded-full font-mono text-xs font-black px-2 py-1 cursor-pointer shadow-pop ${className}`}
      >
        {(Object.keys(CURRENCIES) as CurrencyCode[]).map((c) => (
          <option key={c} value={c}>{c} {CURRENCIES[c].symbol === c ? '' : CURRENCIES[c].symbol}</option>
        ))}
      </select>
    </>
  );
};
