import React from 'react';
import { Search, Sparkles, SlidersHorizontal, Check } from 'lucide-react';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  typoCorrectedFrom?: string;
  matchedTerm?: string;
  maxPrice: number;
  onMaxPriceChange: (p: number) => void;
  inStockOnly: boolean;
  onToggleInStockOnly: () => void;
  latencyMs?: number;
}

const CATEGORIES = ['All', 'Electronics', 'Footwear & Apparel', 'Home Goods', 'Gourmet Grocery'];

export const SearchBar: React.FC<SearchBarProps> = ({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onSelectCategory,
  typoCorrectedFrom,
  matchedTerm,
  maxPrice,
  onMaxPriceChange,
  inStockOnly,
  onToggleInStockOnly,
  latencyMs,
}) => {
  return (
    <div className="space-y-4">
      {/* Search Input Bar */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="absolute left-4 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search products with typo tolerance (try 'snikers', 'kyboard', 'headfone', 'cofee')..."
            className="w-full bg-slate-900/90 text-slate-100 placeholder-slate-400 pl-12 pr-28 py-3.5 rounded-xl border border-slate-700 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition text-sm shadow-inner"
          />
          <div className="absolute right-3 flex items-center gap-2">
            {latencyMs !== undefined && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                {latencyMs}ms
              </span>
            )}
            <kbd className="hidden md:inline-block px-2 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-800 border border-slate-700 rounded">
              /
            </kbd>
          </div>
        </div>

        {/* Typo Correction Banner from OpenSearch Fuzzy Analyzer */}
        {typoCorrectedFrom && (
          <div className="mt-2.5 p-2.5 rounded-lg bg-indigo-950/60 border border-indigo-700/50 flex items-center gap-2 text-xs text-indigo-200">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>
              OpenSearch typo tolerance activated: showing results for{' '}
              <strong className="text-white font-semibold underline decoration-indigo-400 underline-offset-2">
                "{matchedTerm || searchQuery}"
              </strong>{' '}
              matching typo <span className="line-through text-indigo-400">"{typoCorrectedFrom}"</span>
            </span>
          </div>
        )}
      </div>

      {/* Categories & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => onSelectCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-slate-100 text-slate-900 font-semibold shadow-sm'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Price & In-Stock Filters */}
        <div className="flex items-center gap-4 text-xs text-slate-300">
          {/* Max price filter */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            <span>Max: <strong className="text-white tabular-nums">₹{maxPrice.toLocaleString('en-IN')}</strong></span>
            <input
              type="range"
              min="2000"
              max="200000"
              step="5000"
              value={maxPrice}
              onChange={(e) => onMaxPriceChange(Number(e.target.value))}
              className="w-20 accent-brand-500 cursor-pointer"
            />
          </div>

          {/* In-Stock Toggle */}
          <button
            onClick={onToggleInStockOnly}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition ${
              inStockOnly
                ? 'bg-emerald-950/60 border-emerald-600/60 text-emerald-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                inStockOnly ? 'bg-emerald-500 border-emerald-400' : 'border-slate-600'
              }`}
            >
              {inStockOnly && <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />}
            </div>
            <span>In Stock</span>
          </button>
        </div>
      </div>
    </div>
  );
};
