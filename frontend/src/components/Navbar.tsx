import React from 'react';
import { ShoppingBag, Activity, MapPin, Zap, RefreshCw } from 'lucide-react';
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
}

export const Navbar: React.FC<NavbarProps> = ({
  selectedCity,
  onSelectCity,
  cartCount,
  onOpenCart,
  onOpenTelemetry,
  isTelemetryOpen,
  onResetCatalog,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center shadow-glow-brand transition-transform hover:scale-105 duration-200">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white">RetailSync</span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand-500/10 text-brand-400 border border-brand-500/20">
                Aiven Cloud
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">PostgreSQL • Apache Kafka • OpenSearch</p>
          </div>
        </div>

        {/* Center / Right controls */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* City Store Selector */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200">
            <MapPin className="w-3.5 h-3.5 text-brand-400 shrink-0" />
            <span className="text-slate-400 hidden md:inline">Store:</span>
            <select
              value={selectedCity}
              onChange={(e) => onSelectCity(e.target.value as City)}
              className="bg-transparent font-medium text-slate-100 focus:outline-none cursor-pointer pr-1"
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
            title="Reset Catalog & Telemetry State"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* All 3 Services Telemetry Console Trigger */}
          <button
            onClick={onOpenTelemetry}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
              isTelemetryOpen
                ? 'bg-brand-500 text-white border-brand-400 shadow-glow-brand'
                : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-750 hover:border-slate-600'
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">3-Service Telemetry</span>
          </button>

          {/* Shopping Cart Drawer Trigger */}
          <button
            onClick={onOpenCart}
            className="relative flex items-center justify-center p-2 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition"
            aria-label="Open cart"
          >
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-brand-500 text-white text-[11px] font-bold h-5 min-w-[20px] px-1 rounded-full flex items-center justify-center tabular-nums shadow-sm animate-pulse">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
