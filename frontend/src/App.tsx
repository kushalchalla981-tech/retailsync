import { useState, useMemo, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { SearchBar } from './components/SearchBar';
import { ProductCard } from './components/ProductCard';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { ConcurrencyRaceModal } from './components/ConcurrencyRaceModal';
import { TelemetryInspector } from './components/TelemetryInspector';
import { City, Product, CartItem } from './types';
import { apiService } from './services/api';
import { Zap, Sparkles, Database, Layers, Search } from 'lucide-react';

export function App() {
  const [selectedCity, setSelectedCity] = useState<City>('Bangalore');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [maxPrice, setMaxPrice] = useState<number>(200000);
  const [inStockOnly, setInStockOnly] = useState(false);
  
  // UI Dialog States
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(true); // Open by default for hackathon judges!
  const [raceProduct, setRaceProduct] = useState<Product | null>(null);

  // Trigger re-render on inventory changes
  const [catalogVersion, setCatalogVersion] = useState(0);

  // Search results query evaluation
  const searchEvaluation = useMemo(() => {
    return apiService.searchProducts(searchQuery, selectedCategory, selectedCity, maxPrice);
  }, [searchQuery, selectedCategory, selectedCity, maxPrice, catalogVersion]);

  // Apply inStockOnly filter if selected
  const displayedProducts = useMemo(() => {
    if (!inStockOnly) return searchEvaluation.results;
    return searchEvaluation.results.filter((p) => (p.inventory[selectedCity] ?? 0) > 0);
  }, [searchEvaluation.results, inStockOnly, selectedCity]);

  // Cart Management
  const handleAddToCart = (product: Product) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      const currentCityStock = product.inventory[selectedCity] || 0;

      if (existing) {
        if (existing.quantity >= currentCityStock) return prev;
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product, quantity: 1, selectedCity }];
    });
    setIsCartOpen(true);
  };

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveItem(productId);
      return;
    }
    setCartItems((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, quantity } : i))
    );
  };

  const handleRemoveItem = (productId: string) => {
    setCartItems((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const handleResetCatalog = () => {
    apiService.resetCatalog();
    setCartItems([]);
    setCatalogVersion((v) => v + 1);
  };

  // Keyboard shortcut listener for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
        searchInput?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const totalCartUnits = cartItems.reduce((acc, curr) => acc + curr.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-36">
      {/* Top Navbar */}
      <Navbar
        selectedCity={selectedCity}
        onSelectCity={(city) => setSelectedCity(city)}
        cartCount={totalCartUnits}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenTelemetry={() => setIsTelemetryOpen((prev) => !prev)}
        isTelemetryOpen={isTelemetryOpen}
        onResetCatalog={handleResetCatalog}
      />

      {/* Hero & Hackathon Evaluation Banner */}
      <section className="border-b border-slate-800 bg-gradient-to-b from-slate-900 via-slate-900/60 to-slate-950 px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Next-Gen Retail Storefront
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Demonstrating zero-oversell stock integrity via PostgreSQL row-level locks, decoupled streaming with Apache Kafka, and instant typo-tolerant search powered by OpenSearch.
            </p>
          </div>

          {/* Quick Demo Shortcuts for Hackathon Judges */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                const jordan = apiService.getProduct('prod-app-01');
                if (jordan) setRaceProduct(jordan);
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 transition shadow-sm"
            >
              <Zap className="w-4 h-4 fill-amber-400" />
              <span>Simulate Flash Sale Race (Stock = 1)</span>
            </button>

            <button
              onClick={() => setSearchQuery('snikers')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/20 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Test Typo Search ("snikers")</span>
            </button>
          </div>
        </div>

        {/* 3 Mandatory Services Status Bar */}
        <div className="max-w-7xl mx-auto mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">PostgreSQL</span>
              <span className="text-[11px] text-slate-400">SELECT ... FOR UPDATE locks</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">Apache Kafka</span>
              <span className="text-[11px] text-slate-400">orders.placed & inventory.updated</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">OpenSearch</span>
              <span className="text-[11px] text-slate-400">Fuzzy matching & faceted filters</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Storefront Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 space-y-6 w-full">
        {/* Search, Filter & Typo Engine */}
        <SearchBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          typoCorrectedFrom={searchEvaluation.typoCorrectedFrom}
          matchedTerm={searchEvaluation.matchedTerm}
          maxPrice={maxPrice}
          onMaxPriceChange={setMaxPrice}
          inStockOnly={inStockOnly}
          onToggleInStockOnly={() => setInStockOnly((prev) => !prev)}
          latencyMs={searchEvaluation.latencyMs}
        />

        {/* Product Catalog Grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-white">
              Available Catalog ({displayedProducts.length} items in {selectedCity})
            </h2>
            <span className="text-xs text-slate-400">
              Showing real-time store inventory
            </span>
          </div>

          {displayedProducts.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <Search className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-200">No matching products found</p>
              <p className="text-xs text-slate-400">
                Try clearing search filters or raising the maximum price threshold.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {displayedProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  selectedCity={selectedCity}
                  onAddToCart={handleAddToCart}
                  onSimulateRace={(p) => setRaceProduct(p)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        selectedCity={selectedCity}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onProceedToCheckout={() => {
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        items={cartItems}
        selectedCity={selectedCity}
        onOrderSuccess={() => {
          setCartItems([]);
          setCatalogVersion((v) => v + 1);
        }}
      />

      {/* Concurrency Flash Sale Race Condition Modal */}
      {raceProduct && (
        <ConcurrencyRaceModal
          isOpen={true}
          onClose={() => setRaceProduct(null)}
          product={raceProduct}
          selectedCity={selectedCity}
          onStockUpdated={() => setCatalogVersion((v) => v + 1)}
        />
      )}

      {/* Docked All 3 Services Live Telemetry Inspector */}
      <TelemetryInspector
        isOpen={isTelemetryOpen}
        onClose={() => setIsTelemetryOpen(false)}
      />
    </div>
  );
}

export default App;
