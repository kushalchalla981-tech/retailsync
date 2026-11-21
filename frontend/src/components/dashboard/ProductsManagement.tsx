import React, { useState } from 'react';
import { PlusCircle, Search, Trash2, Edit2, Package, Check, X, AlertTriangle } from 'lucide-react';
import { ExtendedStore, storeManager } from '../../data/storeManager';
import { ThunderLine } from '../ThunderLine';

interface ProductsManagementProps {
  store: ExtendedStore;
}

export const ProductsManagement: React.FC<ProductsManagementProps> = ({ store }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [editStockVal, setEditStockVal] = useState<number>(0);

  // New product form state
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('₹');
  const [newProdEmoji, setNewProdEmoji] = useState('📦');
  const [newProdStock, setNewProdStock] = useState(15);
  const [newProdCategory, setNewProdCategory] = useState(store.category);
  const [newProdSku, setNewProdSku] = useState(`RS-${store.category.slice(0, 3).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`);

  const categories = ['All', ...Array.from(new Set(store.catalog.map(p => p.category)))];

  const filteredProducts = store.catalog.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleSaveStock = (productId: string) => {
    storeManager.updateProductStock(store.id, productId, Math.max(0, editStockVal));
    setEditingStockId(null);
  };

  const handleDeleteProduct = (productId: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}" from ${store.name}?`)) {
      storeManager.deleteProduct(store.id, productId);
    }
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim()) return;

    storeManager.addProduct(store.id, {
      name: newProdName,
      price: newProdPrice.startsWith('₹') ? newProdPrice : `₹${newProdPrice}`,
      emoji: newProdEmoji || '🛍️',
      stock: Number(newProdStock) || 0,
      sku: newProdSku || `SKU-${Date.now()}`,
      category: newProdCategory || store.category,
      description: `Official item curated by ${store.name}.`
    });

    setIsAddModalOpen(false);
    setNewProdName('');
    setNewProdPrice('₹');
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#fdfaf6] p-5 rounded-2xl border-3 border-[#1a1918] shadow-pop">
        <div>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-[#ff5c35]" />
            <h2 className="font-black text-xl uppercase tracking-tight text-[#1a1918]">
              {store.name} Catalog
            </h2>
          </div>
          <p className="text-xs font-mono text-[#786f66] mt-0.5">
            Real-time inventory backed by PostgreSQL row locks &amp; OpenSearch sync
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center justify-center gap-2 bg-[#1a1918] text-white px-5 py-2.5 rounded-xl font-mono text-xs uppercase tracking-wider font-black border-2 border-[#1a1918] shadow-pop hover:bg-[#ff5c35] hover:-translate-y-0.5 active:translate-y-0 transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Add Product</span>
        </button>
      </div>

      {/* Filter and search bar */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#786f66]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search products by title, keyword, or SKU..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#fdfaf6] border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] shadow-pop focus:outline-none focus:border-[#ff5c35]"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-2 rounded-xl font-mono text-xs font-bold uppercase whitespace-nowrap border-2 border-[#1a1918] transition-all ${
                selectedCategory === cat
                  ? 'bg-[#1a1918] text-white shadow-pop'
                  : 'bg-[#fdfaf6] text-[#1a1918] hover:bg-[#f5ede4]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Products table */}
      <div className="bg-[#fdfaf6] rounded-2xl border-3 border-[#1a1918] shadow-pop overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#eedfc8] text-[#1a1918] font-mono text-xs uppercase font-extrabold border-b-2 border-[#1a1918]">
              <tr>
                <th className="py-3 px-4">Item</th>
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Price</th>
                <th className="py-3 px-4">Stock</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1918]/10 font-mono text-xs">
              {filteredProducts.map((p) => (
                <tr key={p.id} className="hover:bg-[#f5ede4] transition-colors">
                  <td className="py-3.5 px-4 flex items-center gap-2.5">
                    <span className="text-2xl p-1.5 bg-[#f4f0ed] rounded-xl border border-[#1a1918]/20">{p.emoji}</span>
                    <span className="font-bold text-[#1a1918]">{p.name}</span>
                  </td>
                  <td className="py-3.5 px-4 text-[#786f66]">{p.sku}</td>
                  <td className="py-3.5 px-4">
                    <span className="bg-[#f0e5d8] px-2 py-0.5 rounded text-[11px] font-bold text-[#1a1918]">
                      {p.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-black text-[#1a1918]">{p.price}</td>
                  <td className="py-3.5 px-4">
                    {editingStockId === p.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          value={editStockVal}
                          onChange={(e) => setEditStockVal(Number(e.target.value))}
                          className="w-16 px-2 py-1 bg-white border-2 border-[#1a1918] rounded font-bold text-xs"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveStock(p.id)}
                          className="p-1 bg-[#a7f432] border border-[#1a1918] rounded hover:bg-[#8ee01a]"
                        >
                          <Check className="w-3.5 h-3.5 text-[#1a1918]" />
                        </button>
                        <button
                          onClick={() => setEditingStockId(null)}
                          className="p-1 bg-[#ff5c35] text-white border border-[#1a1918] rounded"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={`font-black ${p.stock <= 5 ? 'text-[#ff5c35]' : 'text-[#1a1918]'}`}>
                          {p.stock} units
                        </span>
                        <button
                          onClick={() => {
                            setEditingStockId(p.id);
                            setEditStockVal(p.stock);
                          }}
                          className="p-1 text-[#786f66] hover:text-[#1a1918] hover:bg-black/5 rounded"
                          title="Edit stock quantity"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    {p.stock === 0 ? (
                      <span className="bg-[#ff5c35]/20 text-[#ff5c35] border border-[#ff5c35] px-2 py-0.5 rounded-full text-[10px] font-black uppercase">
                        Out of Stock
                      </span>
                    ) : p.stock <= 5 ? (
                      <span className="bg-[#ffd600]/30 text-[#b58100] border border-[#ffd600] px-2 py-0.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1 w-fit">
                        <AlertTriangle className="w-3 h-3" /> Low Stock
                      </span>
                    ) : (
                      <span className="bg-[#a7f432]/30 text-[#1a1918] border border-[#a7f432] px-2 py-0.5 rounded-full text-[10px] font-black uppercase">
                        In Stock
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => handleDeleteProduct(p.id, p.name)}
                      className="p-1.5 text-[#ff5c35] hover:bg-[#ff5c35]/10 rounded-lg transition-colors"
                      title="Delete Product"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#1a1918]/70 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="fixed inset-0 -z-10" onClick={() => setIsAddModalOpen(false)} />
          <div
            className="relative w-full max-w-lg bg-[#fdfaf6] border-4 border-[#1a1918] rounded-3xl shadow-pop-lg overflow-hidden my-auto p-6 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b-2 border-[#1a1918]/15 mb-4">
              <div>
                <h3 className="font-black text-xl uppercase tracking-tight text-[#1a1918]">
                  Add New Product
                </h3>
                <ThunderLine color="#ff5c35" className="w-24 h-2 mt-1" />
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-full bg-[#1a1918] text-white hover:bg-[#ff5c35]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div>
                <label className="block font-mono text-xs font-bold uppercase text-[#1a1918] mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  placeholder="e.g. Wireless Ergonomic Mouse"
                  className="w-full px-3.5 py-2.5 bg-white border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] shadow-pop focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-xs font-bold uppercase text-[#1a1918] mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={newProdCategory}
                  onChange={(e) => setNewProdCategory(e.target.value)}
                  placeholder="e.g. Electronics, Peripherals"
                  className="w-full px-3.5 py-2.5 bg-white border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] shadow-pop focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-xs font-bold uppercase text-[#1a1918] mb-1">
                    Price (INR) *
                  </label>
                  <input
                    type="text"
                    required
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    placeholder="₹1,499"
                    className="w-full px-3.5 py-2.5 bg-white border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] shadow-pop focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-mono text-xs font-bold uppercase text-[#1a1918] mb-1">
                    Initial Stock *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={newProdStock}
                    onChange={(e) => setNewProdStock(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-white border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] shadow-pop focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-xs font-bold uppercase text-[#1a1918] mb-1">
                    Product Icon / Emoji
                  </label>
                  <input
                    type="text"
                    value={newProdEmoji}
                    onChange={(e) => setNewProdEmoji(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border-2 border-[#1a1918] rounded-xl font-mono text-lg text-center text-[#1a1918] shadow-pop focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-mono text-xs font-bold uppercase text-[#1a1918] mb-1">
                    SKU Code
                  </label>
                  <input
                    type="text"
                    value={newProdSku}
                    onChange={(e) => setNewProdSku(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] shadow-pop focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full bg-[#1a1918] text-white py-3 rounded-xl font-mono text-xs uppercase tracking-widest font-black border-2 border-[#1a1918] shadow-pop hover:bg-[#ff5c35] transition-all"
                >
                  Deploy to Catalog ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
