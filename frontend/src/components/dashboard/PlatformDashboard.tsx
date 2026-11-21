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
import { AccessDeniedModal } from './AccessDeniedModal';
import { OWNER_EMAIL } from '../../utils/roles';

interface PlatformDashboardProps {
  onBackToHome: () => void;
}

type TabType = 'dashboard' | 'products' | 'orders' | 'customize' | 'assistant';

export const PlatformDashboard: React.FC<PlatformDashboardProps> = ({ onBackToHome }) => {
  const { user } = useUser();
  const [stores, setStores] = useState<ExtendedStore[]>(storeManager.getStores());
  const [orders, setOrders] = useState<StoreOrder[]>(storeManager.getOrders());
  const [activeStoreId, setActiveStoreId] = useState<string>(stores[0]?.id || 'store-1');
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isStoreDropdownOpen, setIsStoreDropdownOpen] = useState(false);

  // Subscribe to changes in storeManager
  useEffect(() => {
    const unsubscribe = storeManager.subscribe(() => {
      const updatedStores = storeManager.getStores();
      setStores([...updatedStores]);
      setOrders([...storeManager.getOrders()]);
      if (!updatedStores.find(s => s.id === activeStoreId) && updatedStores.length > 0) {
        setActiveStoreId(updatedStores[0].id);
      }
    });
    return unsubscribe;
  }, [activeStoreId]);

  // Authorization Check: only the platform owner (OWNER_EMAIL) manages stores.
  const userEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase() || '';
  const isPlatformOwner = userEmail === OWNER_EMAIL;

  const activeStore = stores.find(s => s.id === activeStoreId) || stores[0];

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
              Dashboard
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
            <span className="truncate max-w-[120px] sm:max-w-[180px]">{activeStore?.name || 'Select Store'}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </button>

          {isStoreDropdownOpen && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-64 bg-[#fdfaf6] border-3 border-[#1a1918] rounded-2xl shadow-pop-lg z-50 overflow-hidden font-mono text-xs">
              <div className="p-2 border-b border-[#1a1918]/15 bg-[#eedfc8] font-bold text-[11px] text-[#786f66] uppercase">
                Platform Stores ({stores.length})
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-[#1a1918]/10">
                {stores.map((s) => (
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
                      <span className="truncate">{s.name}</span>
                    </div>
                    <span className="text-[10px] text-[#786f66] uppercase">{s.category}</span>
                  </button>
                ))}
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
            <div className="flex items-center gap-1 bg-[#ffd600] text-[#1a1918] px-2.5 py-1 rounded-full border border-[#1a1918] font-mono text-xs font-bold">
              <span>Visitor</span>
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
          {activeStore && (
            <>
              {activeTab === 'dashboard' && (
                <DashboardOverview
                  store={activeStore}
                  orders={orders}
                  allStores={stores}
                  onNavigateTab={setActiveTab}
                />
              )}

              {activeTab === 'products' && (
                <ProductsManagement store={activeStore} />
              )}

              {activeTab === 'orders' && (
                <OrdersManagement orders={orders} activeStoreName={activeStore.name} />
              )}

              {activeTab === 'customize' && (
                <CustomizeStore
                  store={activeStore}
                  onStoreUpdated={() => setStores([...storeManager.getStores()])}
                />
              )}

              {activeTab === 'assistant' && (
                <AIAssistant store={activeStore} allStores={stores} />
              )}
            </>
          )}
        </main>
      </div>

      {/* Store Creation Modal Wizard */}
      <CreateStoreModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onStoreCreated={(newStore) => {
          setStores([...storeManager.getStores()]);
          setActiveStoreId(newStore.id);
        }}
      />

      {/* Non-owner guard modal */}
      {!isPlatformOwner && (
        <AccessDeniedModal
          isOpen={true}
          onClose={onBackToHome}
          currentUserEmail={userEmail}
        />
      )}
    </div>
  );
};
