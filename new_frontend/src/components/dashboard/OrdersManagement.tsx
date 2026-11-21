import React, { useState } from 'react';
import { ShoppingBag, Truck, Search } from 'lucide-react';
import { StoreOrder, storeManager } from '../../data/storeManager';

interface OrdersManagementProps {
  orders: StoreOrder[];
  activeStoreName: string;
}

export const OrdersManagement: React.FC<OrdersManagementProps> = ({ orders, activeStoreName }) => {
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');

  const statusList = ['All', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

  const filteredOrders = orders.filter(o => {
    const matchesStatus = selectedStatus === 'All' || o.status === selectedStatus;
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customerEmail.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleStatusChange = (orderId: string, newStatus: StoreOrder['status']) => {
    storeManager.updateOrderStatus(orderId, newStatus);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#fdfaf6] p-5 rounded-2xl border-3 border-[#1a1918] shadow-pop">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#ff5c35]" />
            <h2 className="font-black text-xl uppercase tracking-tight text-[#1a1918]">
              Platform Orders
            </h2>
          </div>
          <p className="text-xs font-mono text-[#786f66] mt-0.5">
            Active Store: <span className="font-bold text-[#1a1918]">{activeStoreName}</span> · Payments synced via Razorpay
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs font-bold text-[#1a1918]">
          <span className="bg-[#a7f432] px-3 py-1.5 rounded-xl border border-[#1a1918] shadow-pop">
            {orders.length} Total Orders
          </span>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#786f66]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by order number (#RS-...), customer name, or email..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#fdfaf6] border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] shadow-pop focus:outline-none focus:border-[#ff5c35]"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {statusList.map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStatus(st)}
              className={`px-3.5 py-2 rounded-xl font-mono text-xs font-bold uppercase whitespace-nowrap border-2 border-[#1a1918] transition-all ${
                selectedStatus === st
                  ? 'bg-[#1a1918] text-white shadow-pop'
                  : 'bg-[#fdfaf6] text-[#1a1918] hover:bg-[#f5ede4]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Grid / Cards */}
      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="bg-[#fdfaf6] rounded-2xl border-3 border-[#1a1918] p-10 text-center shadow-pop">
            <ShoppingBag className="w-12 h-12 text-[#786f66] mx-auto mb-3 opacity-40" />
            <h4 className="font-black text-lg text-[#1a1918] uppercase">No Orders Found</h4>
            <p className="text-xs font-mono text-[#786f66] mt-1">
              No transactions match the selected filter. Test purchases placed via Razorpay will appear here in real time.
            </p>
          </div>
        ) : (
          filteredOrders.map((o) => (
            <div
              key={o.id}
              className="bg-[#fdfaf6] rounded-2xl border-3 border-[#1a1918] p-5 shadow-pop hover:-translate-y-0.5 transition-transform"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[#1a1918]/10 pb-3 mb-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-base font-black text-[#1a1918]">{o.orderNumber}</span>
                  <span className="font-mono text-xs bg-[#f0e5d8] px-2.5 py-0.5 rounded-md font-bold text-[#ff5c35] border border-[#1a1918]/20">
                    {o.storeName}
                  </span>
                  <span className="text-xs font-mono text-[#786f66]">{o.createdAt}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-[#786f66]">Update Status:</span>
                  <select
                    value={o.status}
                    onChange={(e) => handleStatusChange(o.id, e.target.value as StoreOrder['status'])}
                    className="font-mono text-xs font-bold bg-[#f4f0ed] border-2 border-[#1a1918] rounded-lg px-2.5 py-1 focus:outline-none cursor-pointer"
                  >
                    <option value="Processing">Processing</option>
                    <option value="Shipped">Shipped</option>
                    <option value="Delivered">Delivered</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Items */}
                <div className="space-y-1.5 md:col-span-1">
                  <span className="text-[11px] font-mono font-bold uppercase text-[#786f66]">Items Ordered</span>
                  <div className="space-y-1">
                    {o.items.map((it, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs font-mono bg-[#f4f0ed] px-2.5 py-1 rounded-lg">
                        <span>{it.emoji} {it.name} <span className="text-[#786f66]">x{it.quantity}</span></span>
                        <span className="font-bold text-[#1a1918]">{it.price}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Customer Details */}
                <div className="space-y-1 text-xs font-mono md:col-span-1">
                  <span className="text-[11px] font-mono font-bold uppercase text-[#786f66]">Customer &amp; Destination</span>
                  <div className="font-bold text-[#1a1918]">{o.customerName}</div>
                  <div className="text-[#786f66]">{o.customerEmail}</div>
                  <div className="text-[#1a1918] flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5 text-[#ff5c35]" /> {o.customerCity}, India
                  </div>
                </div>

                {/* Total & Payment details */}
                <div className="space-y-1.5 md:col-span-1 flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-mono font-bold uppercase text-[#786f66]">Total Amount</span>
                    <div className="text-2xl font-black font-mono text-[#ff5c35]">{o.total}</div>
                  </div>
                  <div className="bg-[#1a1918] text-[#a7f432] px-3 py-1 rounded-lg font-mono text-[11px] font-bold flex items-center justify-between">
                    <span>Razorpay Verified</span>
                    <span className="text-white text-[10px]">{o.paymentId}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
