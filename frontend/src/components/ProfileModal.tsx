import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/react';
import { X, Store, Package, Sparkles, CheckCircle2 } from 'lucide-react';
import { storeManager, StoreOrder } from '../data/storeManager';
import { useCurrency } from '../context/CurrencyContext';
import { ThunderLine } from './ThunderLine';

/** Profile for signed-in shoppers: who they are, their orders, and a way to ask to become a store creator. */
export const ProfileModal: React.FC<{ isOpen: boolean; onClose: () => void; onExplore: () => void }> = ({ isOpen, onClose, onExplore }) => {
  const { user } = useUser();
  const { format } = useCurrency();
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [requesting, setRequesting] = useState(false);

  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? '';
  const requested = user?.unsafeMetadata?.creatorRequest === 'pending';

  useEffect(() => {
    if (!isOpen) return;
    const load = () => setOrders(storeManager.getOrders().filter((o) => o.customerEmail.toLowerCase() === email));
    load();
    const unsub = storeManager.subscribe(load);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { unsub(); window.removeEventListener('keydown', onKey); };
  }, [isOpen, email, onClose]);

  if (!isOpen || !user) return null;

  const apply = async () => {
    setRequesting(true);
    try {
      await user.update({ unsafeMetadata: { ...user.unsafeMetadata, creatorRequest: 'pending' } });
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#1a1918]/60 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-label="Your profile" className="relative w-full max-w-lg bg-[#fdfaf6] border-4 border-[#1a1918] rounded-3xl shadow-pop-lg overflow-hidden animate-fadeIn max-h-[90vh] flex flex-col">
        <header className="bg-[#1a1918] px-6 py-4 flex items-center gap-4">
          <img src={user.imageUrl} alt="" className="w-12 h-12 rounded-full border-2 border-[#a7f432]" />
          <div className="flex-1 min-w-0">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#a7f432]">Shopper</span>
            <h3 className="font-black text-lg text-white truncate">{user.fullName || email}</h3>
            <ThunderLine color="#a7f432" className="w-24 h-2 mt-1" />
          </div>
          <button onClick={onClose} aria-label="Close profile" className="p-1.5 rounded-full bg-white/10 text-white hover:bg-[#ff5c35]"><X className="w-4 h-4" /></button>
        </header>

        <div className="p-6 space-y-6 overflow-y-auto">
          <p className="font-mono text-sm text-[#5a534d] break-all">{email}</p>

          <section className="space-y-3">
            <h4 className="flex items-center gap-2 font-mono text-xs font-black uppercase tracking-widest text-[#1a1918]"><Package className="w-4 h-4" /> Recent orders</h4>
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

          <div className="grid sm:grid-cols-2 gap-3">
            <button onClick={() => { onClose(); onExplore(); }} className="flex items-center justify-center gap-2 bg-[#1a1918] text-white px-4 py-3 rounded-xl font-mono text-xs font-black uppercase tracking-wider hover:bg-[#ff5c35] transition-colors">
              <Store className="w-4 h-4" /> Explore stores
            </button>
            {requested ? (
              <span className="flex items-center justify-center gap-2 bg-[#a7f432] border-2 border-[#1a1918] px-4 py-3 rounded-xl font-mono text-xs font-black uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4" /> Creator request sent
              </span>
            ) : (
              <button onClick={apply} disabled={requesting} className="flex items-center justify-center gap-2 bg-[#ffd600] border-2 border-[#1a1918] px-4 py-3 rounded-xl font-mono text-xs font-black uppercase tracking-wider hover:-translate-y-0.5 transition-transform disabled:opacity-50">
                <Sparkles className="w-4 h-4" /> {requesting ? 'Sending…' : 'Apply as creator'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
