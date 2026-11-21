import React, { useState, useEffect } from 'react';
import { useUser, UserButton } from '@clerk/react';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Palette,
  Sparkles,
  PlusCircle,
  Crown,
  ArrowLeft,
  ChevronDown
} from 'lucide-react';
import { ExtendedStore, StoreOrder, storeManager } from '../../data/storeManager';
import { DashboardOverview } from './DashboardOverview';
import { ProductsManagement } from './ProductsManagement';
import { OrdersManagement } from './OrdersManagement';
import { CustomizeStore } from './CustomizeStore';
import { AIAssistant } from './AIAssistant';
import { CreateStoreModal } from './CreateStoreModal';
import { ThunderLine } from '../ThunderLine';
import { OWNER_EMAIL } from '../../utils/roles';

interface PlatformDashboardProps {
  onBackToHome: () => void;
}

type TabType = 'dashboard' | 'products' | 'orders' | 'customize' | 'assistant';

export const PlatformDashboard: React.FC<PlatformDashboardProps> = ({ onBackToHome }) => {
  const { user } = useUser();
  const userEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase() || '';
  const isPlatformOwner = userEmail === OWNER_EMAIL;
  const me = { id: user?.id ?? '', email: userEmail };

  const [stores, setStores] = useState<ExtendedStore[]>(() =>
    storeManager.getStoresForUser(me, isPlatformOwner)
  );
  const [orders, setOrders] = useState<StoreOrder[]>(storeManager.getOrders());
  const [activeStoreId, setActiveStoreId] = useState<string>(stores[0]?.id || '');
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isStoreDropdownOpen, setIsStoreDropdownOpen] = useState(false);

  // Subscribe to changes in storeManager
  useEffect(() => {
    const unsubscribe = storeManager.subscribe(() => {
      const updatedStores = storeManager.getStoresForUser(me, isPlatformOwner);
      setStores([...updatedStores]);
      setOrders([...storeManager.getOrders()]);
      if (!updatedStores.find(s => s.id === activeStoreId) && updatedStores.length > 0) {
        setActiveStoreId(updatedStores[0].id);
      }
    });
    return unsubscribe;
  }, [activeStoreId, userEmail, isPlatformOwner]);

  // Ensure activeStoreId is set if empty and stores exist
  useEffect(() => {
    if (!activeStoreId && stores.length > 0) {
      setActiveStoreId(stores[0].id);
    }
  }, [stores, activeStoreId]);

  const activeStore = stores.find(s => s.id === activeStoreId) || stores[0];
  // Every view is about the selected store: a merchant never sees other stores' orders or revenue.
  const storeOrders = orders.filter(o => o.storeId === activeStore?.id);

  return (
    <div className="min-h-screen bg-[#f4f0ed] text-[#1a1918] flex flex-col font-sans">
      {/* Top Application Bar */}
      <header className="bg-[#1a1918] text-white px-4 py-3 border-b-4 border-[#1a1918] sticky top-0 z-40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToHome}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-[#ff5c35] text-white font-mono text-xs font-bold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Showcase</span>
          </button>

          <div className="h-6 w-px bg-white/20 hidden sm:block" />

          {/* Platform Brand */}
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-[#ff5c35] text-white flex items-center justify-center text-xs font-black">
              ⚡
            </span>
            <span className="font-black text-lg uppercase tracking-tight text-white hidden sm:inline">
              RetailSync
            </span>
            <span className="bg-[#a7f432] text-[#1a1918] font-mono text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
              {isPlatformOwner ? 'Platform Hub' : 'Merchant Hub'}
            </span>
          </div>
        </div>

        {/* Center: Store Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsStoreDropdownOpen(!isStoreDropdownOpen)}
            className="flex items-center gap-2 bg-[#fdfaf6] text-[#1a1918] px-3.5 py-1.5 rounded-xl border-2 border-[#1a1918] shadow-pop font-mono text-xs font-black uppercase hover:bg-[#eedfc8] transition-all"
          >
            <span className="text-base">{activeStore?.symbol || '🛍️'}</span>
            <span className="truncate max-w-[120px] sm:max-w-[180px]">{activeStore?.name || (isPlatformOwner ? 'Select Store' : 'No Stores Yet')}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </button>

          {isStoreDropdownOpen && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-72 bg-[#fdfaf6] border-3 border-[#1a1918] rounded-2xl shadow-pop-lg z-50 overflow-hidden font-mono text-xs">
              <div className="p-2 border-b border-[#1a1918]/15 bg-[#eedfc8] font-bold text-[11px] text-[#786f66] uppercase flex items-center justify-between">
                <span>{isPlatformOwner ? `All Platform Stores (${stores.length})` : `My Stores (${stores.length})`}</span>
                {isPlatformOwner && <span className="text-[9px] text-[#ff5c35] font-black bg-[#ff5c35]/15 px-1.5 py-0.5 rounded">OWNER</span>}
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-[#1a1918]/10">
                {stores.length === 0 ? (
                  <div className="p-4 text-center text-[#786f66]">No stores created yet</div>
                ) : (
                  stores.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setActiveStoreId(s.id);
                        setIsStoreDropdownOpen(false);
                      }}
                      className={`w-full p-2.5 flex items-center justify-between text-left hover:bg-[#f5ede4] transition-colors ${
                        activeStoreId === s.id ? 'bg-[#ff5c35]/10 font-black text-[#ff5c35]' : 'text-[#1a1918]'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span>{s.symbol}</span>
                        <div className="truncate">
                          <p className="truncate leading-tight">{s.name}</p>
                          {isPlatformOwner && s.ownerEmail && (
                            <p className="text-[9px] text-[#ff5c35] font-normal truncate">
                              by {s.ownerName || s.ownerEmail}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-[#786f66] uppercase shrink-0 ml-1.5">{s.category}</span>
                    </button>
                  ))
                )}
              </div>
              <div className="p-2 border-t-2 border-[#1a1918] bg-[#f4f0ed]">
                <button
                  onClick={() => {
                    setIsStoreDropdownOpen(false);
                    setIsCreateModalOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 bg-[#1a1918] text-white py-1.5 rounded-lg text-xs font-bold uppercase hover:bg-[#ff5c35] transition-colors"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Create New Store</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Platform Owner Badge & Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {isPlatformOwner ? (
            <div className="flex items-center gap-1.5 bg-[#a7f432] text-[#1a1918] px-2.5 py-1 rounded-full border border-[#1a1918] font-mono text-xs font-black shadow-pop">
              <Crown className="w-3.5 h-3.5 text-[#1a1918]" />
              <span className="hidden md:inline">Platform Owner</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-[#ffd600] text-[#1a1918] px-2.5 py-1 rounded-full border border-[#1a1918] font-mono text-xs font-bold shadow-pop">
              <span className="hidden md:inline">🏪</span>
              <span>Merchant</span>
            </div>
          )}
          <UserButton />
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Left Sidebar Navigation */}
        <aside className="w-full md:w-64 bg-[#fdfaf6] border-r-3 border-b-3 md:border-b-0 border-[#1a1918] p-4 flex flex-col justify-between shrink-0">
          <div className="space-y-6">
            {/* Active Store Widget */}
            <div className="bg-[#eedfc8] p-3 rounded-2xl border-2 border-[#1a1918] shadow-pop">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-10 h-10 rounded-xl border-2 border-[#1a1918] flex items-center justify-center text-xl shrink-0 shadow-sm"
                  style={{ backgroundColor: activeStore?.primaryColor }}
                >
                  {activeStore?.symbol}
                </div>
                <div className="min-w-0">
                  <h4 className="font-black text-sm text-[#1a1918] truncate uppercase">
                    {activeStore?.name}
                  </h4>
                  <span className="font-mono text-[11px] text-[#ff5c35] font-bold block truncate">
                    /{activeStore?.slug}
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation Links */}
            <nav className="space-y-1 font-mono text-xs font-black uppercase">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border-2 transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-[#1a1918] text-white border-[#1a1918] shadow-pop'
                    : 'bg-transparent text-[#1a1918] border-transparent hover:bg-[#f4f0ed]'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 text-[#00e5ff]" />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => setActiveTab('products')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border-2 transition-all ${
                  activeTab === 'products'
                    ? 'bg-[#1a1918] text-white border-[#1a1918] shadow-pop'
                    : 'bg-transparent text-[#1a1918] border-transparent hover:bg-[#f4f0ed]'
                }`}
              >
                <Package className="w-4 h-4 text-[#ff5c35]" />
                <span>Products</span>
              </button>

              <button
                onClick={() => setActiveTab('orders')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border-2 transition-all ${
                  activeTab === 'orders'
                    ? 'bg-[#1a1918] text-white border-[#1a1918] shadow-pop'
                    : 'bg-transparent text-[#1a1918] border-transparent hover:bg-[#f4f0ed]'
                }`}
              >
                <ShoppingBag className="w-4 h-4 text-[#ffd600]" />
                <span>Orders</span>
              </button>

              <button
                onClick={() => setActiveTab('customize')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border-2 transition-all ${
                  activeTab === 'customize'
                    ? 'bg-[#1a1918] text-white border-[#1a1918] shadow-pop'
                    : 'bg-transparent text-[#1a1918] border-transparent hover:bg-[#f4f0ed]'
                }`}
              >
                <Palette className="w-4 h-4 text-[#a7f432]" />
                <span>Customize</span>
              </button>

              <button
                onClick={() => setActiveTab('assistant')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border-2 transition-all ${
                  activeTab === 'assistant'
                    ? 'bg-[#1a1918] text-white border-[#1a1918] shadow-pop'
                    : 'bg-transparent text-[#1a1918] border-transparent hover:bg-[#f4f0ed]'
                }`}
              >
                <Sparkles className="w-4 h-4 text-[#00e5ff]" />
                <span>AI Assistant</span>
              </button>
            </nav>
          </div>

          {/* Sidebar Bottom CTA */}
          <div className="pt-6 border-t-2 border-[#1a1918]/15 space-y-2">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 bg-[#ff5c35] text-white py-2.5 rounded-xl font-mono text-xs uppercase tracking-wider font-black border-2 border-[#1a1918] shadow-pop hover:bg-[#1a1918] transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Store</span>
            </button>

            <button
              onClick={onBackToHome}
              className="w-full flex items-center justify-center gap-2 bg-white text-[#1a1918] py-2 rounded-xl font-mono text-xs font-bold border-2 border-[#1a1918] hover:bg-[#f5ede4]"
            >
              <span>Browse 3D Showcase</span>
            </button>
          </div>
        </aside>

        {/* Center Content Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {activeStore ? (
            <>
              {activeTab === 'dashboard' && (
                <DashboardOverview
                  store={activeStore}
                  orders={storeOrders}
                  allStores={stores}
                  onNavigateTab={setActiveTab}
                  showPlatformHealth={isPlatformOwner}
                />
              )}

              {activeTab === 'products' && (
                <ProductsManagement store={activeStore} />
              )}

              {activeTab === 'orders' && (
                <OrdersManagement orders={storeOrders} activeStoreName={activeStore.name} />
              )}

              {activeTab === 'customize' && (
                <CustomizeStore
                  store={activeStore}
                  onStoreUpdated={() => setStores([...storeManager.getStoresForUser(me, isPlatformOwner)])}
                />
              )}

              {activeTab === 'assistant' && (
                <AIAssistant store={activeStore} allStores={stores} />
              )}
            </>
          ) : (
            <div className="max-w-xl mx-auto my-12 bg-white border-4 border-[#1a1918] rounded-3xl p-8 shadow-pop-lg text-center space-y-5 animate-fadeIn">
              <div className="w-16 h-16 bg-[#ff5c35]/15 border-2 border-[#1a1918] rounded-2xl flex items-center justify-center mx-auto text-3xl shadow-pop">
                🏪
              </div>
              <div>
                <h2 className="font-black text-2xl uppercase tracking-tight text-[#1a1918]">Welcome to Merchant Studio</h2>
                <ThunderLine color="#ff5c35" className="w-32 h-2.5 mx-auto mt-2" />
              </div>
              <p className="text-sm text-[#5a534d] leading-relaxed">
                You haven't launched a store yet. Launch your storefront in under 2 minutes to begin managing products, tracking live orders, and customizing your brand.
              </p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center gap-2 bg-[#ff5c35] text-white px-6 py-3 rounded-xl font-mono text-xs uppercase tracking-wider font-black border-2 border-[#1a1918] shadow-pop hover:bg-[#1a1918] transition-all cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Launch Your First Store</span>
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Store Creation Modal Wizard */}
      <CreateStoreModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onStoreCreated={(newStore) => {
          setStores([...storeManager.getStoresForUser(me, isPlatformOwner)]);
          setActiveStoreId(newStore.id);
        }}
      />
    </div>
  );
};
