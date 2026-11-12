import React from 'react';
import { X, Trash2, Plus, Minus, ArrowRight, ShoppingBag, ShieldCheck } from 'lucide-react';
import { CartItem, City } from '../types';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  selectedCity: City;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onProceedToCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  selectedCity,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout,
}) => {
  if (!isOpen) return null;

  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const total = subtotal;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col">
          {/* Drawer Header */}
          <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center text-brand-400 border border-brand-500/20">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <h2 className="text-base font-semibold text-white">Your Shopping Cart</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Items List */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-3">
                <ShoppingBag className="w-12 h-12 text-slate-600 stroke-[1.5]" />
                <p className="text-sm font-medium">Your cart is currently empty</p>
                <p className="text-xs text-slate-500 max-w-xs">
                  Browse products and add them to test the live stock reservations.
                </p>
              </div>
            ) : (
              items.map((item) => {
                const maxStock = item.product.inventory[selectedCity] || 0;
                return (
                  <div
                    key={item.product.id}
                    className="p-3.5 rounded-xl bg-slate-850 border border-slate-800 flex gap-3.5 items-center"
                  >
                    <img
                      src={item.product.image}
                      alt={item.product.title}
                      className="w-16 h-16 rounded-lg object-cover bg-slate-950 shrink-0 border border-slate-800"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-semibold text-slate-100 truncate">
                        {item.product.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Stock in {selectedCity}: <span className="text-emerald-400 font-medium tabular-nums">{maxStock} units</span>
                      </p>
                      <div className="text-xs font-bold text-white tabular-nums mt-1">
                        ₹{(item.product.price * item.quantity).toLocaleString('en-IN')}
                      </div>
                    </div>

                    {/* Quantity controls */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <button
                        onClick={() => onRemoveItem(item.product.id)}
                        className="text-slate-500 hover:text-rose-400 transition p-1"
                        title="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg p-0.5">
                        <button
                          onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-semibold text-white px-1.5 tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                          disabled={item.quantity >= maxStock}
                          className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                          title={item.quantity >= maxStock ? 'Max stock reached' : undefined}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Drawer Footer with Checkout */}
          {items.length > 0 && (
            <div className="p-4 sm:p-6 border-t border-slate-800 bg-slate-950/80 space-y-4">
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal</span>
                  <span className="text-white font-medium tabular-nums">₹{subtotal.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Store Pickup & Delivery</span>
                  <span className="text-emerald-400 font-medium">FREE</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-slate-800">
                  <span>Total Due</span>
                  <span className="text-base text-brand-400 tabular-nums">₹{total.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Protected by PostgreSQL Row Locks (Zero Oversell Guarantee)</span>
              </div>

              <button
                onClick={onProceedToCheckout}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm transition shadow-glow-brand"
              >
                <span>Proceed to Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
