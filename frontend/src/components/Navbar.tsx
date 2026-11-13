import React from 'react';
import { ShoppingBag, Activity, MapPin, Zap, RefreshCw, Command } from 'lucide-react';
import { City } from '../types';
import { STORE_LOCATIONS } from '../data/mockData';

interface NavbarProps {
  selectedCity: City;
  onSelectCity: (city: City) => void;
  cartCount: number;
  onOpenCart: () => void;
  onOpenTelemetry: () => void;
  isTelemetryOpen: boolean;
  onResetCatalog: () => void;
  onTriggerSearch: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  selectedCity,
  onSelectCity,
  cartCount,
  onOpenCart,
  onOpenTelemetry,
  isTelemetryOpen,
  onResetCatalog,
  onTriggerSearch,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#070A12]/95 backdrop-blur-md border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand Mark */}
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-brand-500 flex items-center justify-center text-white shadow-sm transition-transform hover:scale-105 duration-200">
            <Zap className="w-4 h-4 fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-base font-extrabold tracking-tight text-white uppercase">
                RetailSync
              </span>
              <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Aiven Core
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-400 hidden sm:block">
              PostgreSQL • Kafka • OpenSearch
            </p>
          </div>
        </div>

        {/* Center / Right controls */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Quick Search Trigger */}
          <button
            onClick={onTriggerSearch}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-700 transition"
          >
            <span>Search products</span>
            <kbd className="inline-flex items-center gap-0.5 text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
              <Command className="w-2.5 h-2.5" /> K
            </kbd>
          </button>

          {/* Flagship Store City Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200">
            <MapPin className="w-3.5 h-3.5 text-brand-500 shrink-0" />
            <span className="text-slate-400 hidden lg:inline font-mono text-[11px]">HUB:</span>
            <select
              value={selectedCity}
              onChange={(e) => onSelectCity(e.target.value as City)}
              className="bg-transparent font-medium text-slate-100 focus:outline-none cursor-pointer pr-1 text-xs"
            >
              {STORE_LOCATIONS.map((loc) => (
                <option key={loc.id} value={loc.city} className="bg-slate-900 text-slate-100">
                  {loc.city} ({loc.name.split(' ')[0]})
                </option>
              ))}
            </select>
          </div>

          {/* Reset button */}
          <button
            onClick={onResetCatalog}
            title="Reset Catalog & Seed State"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition border border-transparent hover:border-slate-800"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Engine Room / Telemetry Console Trigger */}
          <button
            onClick={onOpenTelemetry}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
              isTelemetryOpen
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-mono text-[11px]">Telemetry</span>
          </button>

          {/* Cart Trigger */}
          <button
            onClick={onOpenCart}
            className="relative flex items-center justify-center p-2 rounded-lg bg-slate-900 text-slate-200 border border-slate-800 hover:border-slate-700 transition"
            aria-label="Open cart"
          >
            <ShoppingBag className="w-4 h-4" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-brand-500 text-white text-[10px] font-bold h-4.5 min-w-[18px] px-1 rounded-full flex items-center justify-center tabular-nums">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
