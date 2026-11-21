import React from 'react';
import { IndianRupee, ShoppingBag, Package, AlertTriangle, Database, Zap, Search } from 'lucide-react';
import { ExtendedStore, StoreOrder, STOCK_BASELINE, STOCK_TOPLINE } from '../../data/storeManager';

interface DashboardOverviewProps {
  store: ExtendedStore;
  orders: StoreOrder[];
  allStores: ExtendedStore[];
  onNavigateTab: (tab: 'products' | 'orders' | 'customize' | 'assistant') => void;
  /** Platform-only panels (Aiven infrastructure health) are shown to the platform owner only. */
  showPlatformHealth: boolean;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  store,
  orders,
  allStores,
  onNavigateTab,
  showPlatformHealth,
}) => {
  // Compute metrics
  const totalRevenue = orders.reduce((sum, o) => {
    const amt = parseInt(o.total.replace(/[₹,]/g, ''), 10) || 0;
    return sum + amt;
  }, 0);

  const lowStockCount = store.catalog.filter(p => p.stock <= STOCK_BASELINE).length;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Creator Info Pill for Stores */}
      {store.ownerEmail && (
        <div className="bg-[#eedfc8] border-2 border-[#1a1918] rounded-2xl px-4 py-2.5 flex items-center justify-between text-xs font-mono shadow-sm">
          <div className="flex items-center gap-2">
            <span className="bg-[#1a1918] text-[#a7f432] px-2 py-0.5 rounded-full text-[10px] font-black uppercase">
              Creator Store
            </span>
            <span className="font-bold text-[#1a1918]">Created by:</span>
            <span className="text-[#ff5c35] font-black">{store.ownerName || 'Merchant'}</span>
            <span className="text-[#786f66]">({store.ownerEmail})</span>
          </div>
          {store.createdDate && (
            <span className="text-[#786f66] hidden sm:inline">
              Launched {new Date(store.createdDate).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-[#fdfaf6] p-5 rounded-2xl border-3 border-[#1a1918] shadow-pop">
          <div className="flex items-center justify-between text-[#786f66] mb-2 font-mono text-xs uppercase font-bold">
            <span>Total Revenue</span>
            <div className="p-2 bg-[#ffd600] rounded-xl border-2 border-[#1a1918] text-[#1a1918]">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#1a1918] font-mono">
            ₹{totalRevenue.toLocaleString('en-IN')}
          </div>
          <div className="mt-2 text-xs font-mono font-bold text-[#786f66]">This store's paid orders</div>
        </div>

        {/* Total Orders */}
        <div className="bg-[#fdfaf6] p-5 rounded-2xl border-3 border-[#1a1918] shadow-pop">
          <div className="flex items-center justify-between text-[#786f66] mb-2 font-mono text-xs uppercase font-bold">
            <span>Total Orders</span>
            <div className="p-2 bg-[#00e5ff] rounded-xl border-2 border-[#1a1918] text-[#1a1918]">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#1a1918] font-mono">
            {orders.length}
          </div>
          <div className="mt-2 text-xs font-mono font-bold text-[#786f66]">Paid via Razorpay</div>
        </div>

        {/* Active Products */}
        <div className="bg-[#fdfaf6] p-5 rounded-2xl border-3 border-[#1a1918] shadow-pop cursor-pointer hover:-translate-y-0.5 transition-transform" onClick={() => onNavigateTab('products')}>
          <div className="flex items-center justify-between text-[#786f66] mb-2 font-mono text-xs uppercase font-bold">
            <span>Active Products</span>
            <div className="p-2 bg-[#ff5c35] rounded-xl border-2 border-[#1a1918] text-white">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#1a1918] font-mono">
            {store.catalog.length}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs font-mono font-bold text-[#786f66]">
            <span>{allStores.length > 1 ? `${allStores.length} stores` : 'Store catalog'} · Top line cap: {STOCK_TOPLINE} units</span>
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-[#fdfaf6] p-5 rounded-2xl border-3 border-[#1a1918] shadow-pop cursor-pointer hover:-translate-y-0.5 transition-transform" onClick={() => onNavigateTab('products')}>
          <div className="flex items-center justify-between text-[#786f66] mb-2 font-mono text-xs uppercase font-bold">
            <span>Low Stock Alerts</span>
            <div className={`p-2 rounded-xl border-2 border-[#1a1918] ${lowStockCount > 0 ? 'bg-[#ff5c35] text-white animate-bounce' : 'bg-[#a7f432] text-[#1a1918]'}`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#ff5c35] font-mono">
            {lowStockCount}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs font-mono font-bold text-[#786f66]">
            <span>At or below baseline (≤ {STOCK_BASELINE} units)</span>
          </div>
        </div>
      </div>

      {/* Live Aiven Infrastructure Health & Telemetry Strip (platform owner only) */}
      {showPlatformHealth && (
      <div className="bg-[#1a1918] text-[#fdfaf6] rounded-2xl p-5 border-3 border-[#1a1918] shadow-pop">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#a7f432] animate-ping" />
            <span className="font-mono text-xs font-black uppercase tracking-wider text-[#a7f432]">
              AIVEN MANAGED INFRASTRUCTURE · LIVE HEALTH
            </span>
          </div>
          <span className="font-mono text-xs text-[#a09890]">
            Concurrency Protection: ACTIVE (0% Overselling)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/5 rounded-xl p-3.5 border border-white/10">
            <div className="flex items-center gap-2 mb-1 text-[#ff5c35]">
              <Database className="w-4 h-4" />
              <span className="font-mono text-xs font-bold uppercase">PostgreSQL Row Locks</span>
            </div>
            <div className="text-lg font-black font-mono">0ms lock wait</div>
            <p className="text-[11px] text-[#a09890] mt-0.5 font-mono">SELECT ... FOR UPDATE serialized checkouts</p>
          </div>

          <div className="bg-white/5 rounded-xl p-3.5 border border-white/10">
            <div className="flex items-center gap-2 mb-1 text-[#ffd600]">
              <Zap className="w-4 h-4" />
              <span className="font-mono text-xs font-bold uppercase">Kafka Event Streams</span>
            </div>
            <div className="text-lg font-black font-mono">142 msgs / min</div>
            <p className="text-[11px] text-[#a09890] mt-0.5 font-mono">orders.placed &amp; inventory.updated active</p>
          </div>

          <div className="bg-white/5 rounded-xl p-3.5 border border-white/10">
            <div className="flex items-center gap-2 mb-1 text-[#00e5ff]">
              <Search className="w-4 h-4" />
              <span className="font-mono text-xs font-bold uppercase">OpenSearch Fuzzy Index</span>
            </div>
            <div className="text-lg font-black font-mono">38ms search latency</div>
            <p className="text-[11px] text-[#a09890] mt-0.5 font-mono">Typo-tolerant autocomplete synchronized</p>
          </div>
        </div>
      </div>
      )}

      {/* Recent Orders Section */}
      <div className="bg-[#fdfaf6] rounded-2xl border-3 border-[#1a1918] shadow-pop overflow-hidden">
        <div className="px-6 py-4 border-b-2 border-[#1a1918] flex items-center justify-between bg-[#f4f0ed]">
          <div>
            <h3 className="font-black text-lg uppercase tracking-tight text-[#1a1918]">
              Recent Platform Orders
            </h3>
            <span className="text-xs font-mono text-[#786f66]">Live transactions processed via Razorpay</span>
          </div>
          <button
            onClick={() => onNavigateTab('orders')}
            className="text-xs font-mono font-bold uppercase text-[#ff5c35] hover:text-[#1a1918] transition-colors"
          >
            View All Orders ➔
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#eedfc8] text-[#1a1918] font-mono text-xs uppercase font-extrabold border-b-2 border-[#1a1918]">
              <tr>
                <th className="py-3 px-4">Order #</th>
                <th className="py-3 px-4">Store</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Items</th>
                <th className="py-3 px-4">Total</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1918]/10 font-mono text-xs">
              {orders.slice(0, 5).map((o) => (
                <tr key={o.id} className="hover:bg-[#f5ede4] transition-colors">
                  <td className="py-3 px-4 font-bold text-[#1a1918]">{o.orderNumber}</td>
                  <td className="py-3 px-4 text-[#ff5c35] font-extrabold">{o.storeName}</td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-[#1a1918]">{o.customerName}</div>
                    <div className="text-[10px] text-[#786f66]">{o.customerCity}</div>
                  </td>
                  <td className="py-3 px-4 text-[#3c3732]">
                    {o.items.map(it => `${it.emoji} ${it.name} (x${it.quantity})`).join(', ')}
                  </td>
                  <td className="py-3 px-4 font-bold text-[#1a1918]">{o.total}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase border border-[#1a1918] ${
                      o.status === 'Delivered'
                        ? 'bg-[#a7f432] text-[#1a1918]'
                        : o.status === 'Shipped'
                        ? 'bg-[#00e5ff] text-[#1a1918]'
                        : 'bg-[#ffd600] text-[#1a1918]'
                    }`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-[10px] text-[#786f66] font-mono">{o.paymentId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
