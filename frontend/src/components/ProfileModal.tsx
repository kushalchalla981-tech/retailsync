import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/react';
import { X, Store, Package, Sparkles, LayoutDashboard, Crown } from 'lucide-react';
import { storeManager, StoreOrder, ExtendedStore } from '../data/storeManager';
import { useCurrency } from '../context/CurrencyContext';
import { ThunderLine } from './ThunderLine';
import { OWNER_EMAIL } from '../utils/roles';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExplore: () => void;
  onCreateStore: () => void;
  onOpenDashboard: () => void;
}

/** Profile for signed-in users: their orders, their stores, and direct store creation. */
export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  onExplore,
  onCreateStore,
  onOpenDashboard
}) => {
  const { user } = useUser();
  const { format } = useCurrency();
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [userStores, setUserStores] = useState<ExtendedStore[]>([]);

  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? '';
  const isPlatformOwner = email === OWNER_EMAIL;

  useEffect(() => {
    if (!isOpen || !email) return;
    const load = () => {
      setOrders(storeManager.getOrders().filter((o) => o.customerEmail.toLowerCase() === email));
      setUserStores(storeManager.getStoresForUser({ id: user?.id ?? '', email }, isPlatformOwner));
    };
    load();
    const unsub = storeManager.subscribe(load);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { unsub(); window.removeEventListener('keydown', onKey); };
  }, [isOpen, email, isPlatformOwner, onClose]);

  if (!isOpen || !user) return null;

  const hasStores = userStores.length > 0;

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#1a1918]/60 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-label="Your profile" className="relative w-full max-w-lg bg-[#fdfaf6] border-4 border-[#1a1918] rounded-3xl shadow-pop-lg overflow-hidden animate-fadeIn max-h-[90vh] flex flex-col">
        <header className="bg-[#1a1918] px-6 py-4 flex items-center gap-4">
          <img src={user.imageUrl} alt="" className="w-12 h-12 rounded-full border-2 border-[#a7f432]" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-mono text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isPlatformOwner
                  ? 'bg-[#a7f432] text-[#1a1918]'
                  : hasStores
                  ? 'bg-[#ffd600] text-[#1a1918]'
                  : 'bg-white/20 text-white'
              }`}>
                {isPlatformOwner ? 'Platform Owner' : hasStores ? 'Merchant' : 'Shopper'}
              </span>
            </div>
            <h3 className="font-black text-lg text-white truncate mt-0.5">{user.fullName || email}</h3>
            <ThunderLine color={isPlatformOwner ? '#a7f432' : '#ffd600'} className="w-24 h-2 mt-1" />
          </div>
          <button onClick={onClose} aria-label="Close profile" className="p-1.5 rounded-full bg-white/10 text-white hover:bg-[#ff5c35]">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-6 space-y-6 overflow-y-auto">
          <p className="font-mono text-sm text-[#5a534d] break-all">{email}</p>

          {/* User's Stores Section */}
          {hasStores && (
            <section className="space-y-3 bg-[#f2ebe6] p-4 rounded-2xl border-2 border-[#1a1918]">
              <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-2 font-mono text-xs font-black uppercase tracking-widest text-[#1a1918]">
                  <Store className="w-4 h-4 text-[#ff5c35]" />
                  {isPlatformOwner ? `All Managed Stores (${userStores.length})` : `Your Stores (${userStores.length})`}
                </h4>
                <button
                  onClick={() => { onClose(); onCreateStore(); }}
                  className="font-mono text-xs font-black text-[#ff5c35] hover:underline"
                >
                  + New Store
                </button>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {userStores.slice(0, 4).map((s) => (
                  <div key={s.id} className="flex items-center justify-between bg-white border-2 border-[#1a1918] rounded-xl px-3 py-2 shadow-xs">
                    <div className="flex items-center gap-2 truncate min-w-0">
                      <span>{s.symbol}</span>
                      <span className="font-bold text-xs text-[#1a1918] truncate">{s.name}</span>
                      <span className="text-[10px] text-[#786f66] uppercase bg-[#eedfc8] px-1.5 py-0.5 rounded font-mono font-bold">
                        {s.category}
                      </span>
                    </div>
                    <button
                      onClick={() => { onClose(); onOpenDashboard(); }}
                      className="text-[11px] font-mono font-black uppercase bg-[#1a1918] text-white px-2.5 py-1 rounded-lg hover:bg-[#ff5c35] transition-colors shrink-0 ml-2"
                    >
                      Dashboard
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Recent Orders Section */}
          <section className="space-y-3">
            <h4 className="flex items-center gap-2 font-mono text-xs font-black uppercase tracking-widest text-[#1a1918]">
              <Package className="w-4 h-4" /> Recent orders
            </h4>
            {orders.length === 0 ? (
              <p className="text-sm text-[#5a534d]">No orders yet.</p>
            ) : (
              <ul className="space-y-2">
                {orders.slice(0, 5).map((o) => (
                  <li key={o.id} className="flex items-center justify-between bg-white border-2 border-[#1a1918] rounded-xl px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-black text-sm text-[#1a1918] truncate">{o.storeName} · {o.orderNumber}</p>
                      <p className="font-mono text-[11px] text-[#786f66] truncate">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="font-mono text-sm font-black">{format(o.total)}</p>
                      <p className="font-mono text-[11px] text-[#786f66]">{o.status}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Action CTAs */}
          {hasStores ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <button
                onClick={() => { onClose(); onOpenDashboard(); }}
                className="flex items-center justify-center gap-2 bg-[#ff5c35] text-white px-4 py-3 rounded-xl font-mono text-xs font-black uppercase tracking-wider hover:bg-[#1a1918] transition-colors shadow-pop cursor-pointer"
              >
                {isPlatformOwner ? <Crown className="w-4 h-4" /> : <LayoutDashboard className="w-4 h-4" />}
                <span>{isPlatformOwner ? 'Platform Dashboard' : 'Store Dashboard'}</span>
              </button>
              <button
                onClick={() => { onClose(); onCreateStore(); }}
                className="flex items-center justify-center gap-2 bg-[#ffd600] border-2 border-[#1a1918] px-4 py-3 rounded-xl font-mono text-xs font-black uppercase tracking-wider hover:-translate-y-0.5 transition-transform shadow-pop cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Create New Store</span>
              </button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              <button
                onClick={() => { onClose(); onExplore(); }}
                className="flex items-center justify-center gap-2 bg-[#1a1918] text-white px-4 py-3 rounded-xl font-mono text-xs font-black uppercase tracking-wider hover:bg-[#ff5c35] transition-colors cursor-pointer"
              >
                <Store className="w-4 h-4" />
                <span>Explore stores</span>
              </button>
              <button
                onClick={() => { onClose(); onCreateStore(); }}
                className="flex items-center justify-center gap-2 bg-[#a7f432] text-[#1a1918] border-2 border-[#1a1918] px-4 py-3 rounded-xl font-mono text-xs font-black uppercase tracking-wider hover:-translate-y-0.5 transition-transform shadow-pop cursor-pointer font-black"
              >
                <Sparkles className="w-4 h-4" />
                <span>Create Your Store</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
