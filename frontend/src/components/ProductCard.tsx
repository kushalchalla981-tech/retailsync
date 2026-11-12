import React from 'react';
import { ShoppingBag, Star, Zap, AlertTriangle } from 'lucide-react';
import { Product, City } from '../types';

interface ProductCardProps {
  product: Product;
  selectedCity: City;
  onAddToCart: (product: Product) => void;
  onSimulateRace: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  selectedCity,
  onAddToCart,
  onSimulateRace,
}) => {
  const stock = product.inventory[selectedCity] ?? 0;
  const isOutOfStock = stock === 0;
  const isLowStock = stock === 1;

  return (
    <div className="group relative bg-slate-850/90 rounded-2xl border border-slate-700/60 overflow-hidden hover:border-slate-500/80 hover:shadow-xl transition-all duration-300 flex flex-col">
      {/* Product Image Container */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-900">
        <img
          src={product.image}
          alt={product.title}
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />

        {/* Stock Badge Overlay */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 items-start">
          {isOutOfStock ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-300 border border-rose-800/60 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
              Sold Out in {selectedCity}
            </span>
          ) : isLowStock ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-600/60 backdrop-blur-md animate-pulse">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              Only 1 left in {selectedCity}!
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              {stock} in stock ({selectedCity})
            </span>
          )}
        </div>

        {/* Rating badge */}
        <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950/70 backdrop-blur-md text-xs font-semibold text-amber-300 border border-slate-800">
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
          <span className="tabular-nums">{product.rating}</span>
        </div>
      </div>

      {/* Product Content Details */}
      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div>
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            {product.category}
          </span>
          <h3 className="text-sm font-semibold text-slate-100 line-clamp-2 mt-0.5 group-hover:text-brand-400 transition-colors">
            {product.title}
          </h3>
          <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
            {product.description}
          </p>
        </div>

        {/* Price & Action Buttons */}
        <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between gap-2">
          <div>
            <span className="text-xs text-slate-400 block">Price</span>
            <span className="text-lg font-bold text-white tabular-nums">
              ₹{product.price.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Live Concurrency Race Test Trigger for Judges when stock = 1 */}
            {isLowStock && (
              <button
                onClick={() => onSimulateRace(product)}
                title="Test simultaneous checkouts (PostgreSQL locking proof)"
                className="px-2.5 py-2 rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition flex items-center gap-1"
              >
                <Zap className="w-3.5 h-3.5 fill-amber-400" />
                <span className="hidden xl:inline">Race Test</span>
              </button>
            )}

            {/* Standard Add to Cart button */}
            <button
              onClick={() => onAddToCart(product)}
              disabled={isOutOfStock}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                isOutOfStock
                  ? 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
                  : 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm hover:shadow-glow-brand active:scale-95'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>{isOutOfStock ? 'Sold Out' : 'Add to Cart'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
