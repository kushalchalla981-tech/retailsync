import { useState, useMemo, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { MotionBackground } from './components/MotionBackground';
import { SearchBar } from './components/SearchBar';
import { ProductCard } from './components/ProductCard';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { ConcurrencyRaceModal } from './components/ConcurrencyRaceModal';
import { TelemetryInspector } from './components/TelemetryInspector';
import { City, Product, CartItem } from './types';
import { apiService } from './services/api';
import { Search } from 'lucide-react';

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
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(true); // Floating dock by default
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

  // Spotlight Product for Hero Section
  const spotlightProduct = useMemo(() => {
    return apiService.getProduct('prod-app-01') || searchEvaluation.results[0];
  }, [catalogVersion, searchEvaluation.results]);

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

  const handleTriggerSearch = () => {
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    input?.focus();
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Keyboard shortcut listener for search (⌘K or /)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        handleTriggerSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const totalCartUnits = cartItems.reduce((acc, curr) => acc + curr.quantity, 0);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#070A12] text-slate-100 flex flex-col pb-28">
      {/* Ambient Geometric Matrix Mesh Background */}
      <MotionBackground />

      {/* Top Navbar */}
      <Navbar
        selectedCity={selectedCity}
        onSelectCity={(city) => setSelectedCity(city)}
        cartCount={totalCartUnits}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenTelemetry={() => setIsTelemetryOpen((prev) => !prev)}
        isTelemetryOpen={isTelemetryOpen}
        onResetCatalog={handleResetCatalog}
        onTriggerSearch={handleTriggerSearch}
      />

      {/* Editorial Hero Section */}
      <HeroSection
        spotlightProduct={spotlightProduct}
        selectedCity={selectedCity}
        onSimulateRaceClick={(product) => setRaceProduct(product)}
        onTypoSearchClick={() => {
          setSearchQuery('snikers');
          handleTriggerSearch();
        }}
        onOpenTelemetryClick={() => setIsTelemetryOpen(true)}
      />

      {/* Main Storefront Catalog Area */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-1 space-y-8 w-full">
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
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div>
              <h2 className="font-display text-lg font-bold text-white tracking-tight">
                Curated Inventory ({displayedProducts.length} items in {selectedCity})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time multi-city availability synced directly from OpenSearch index
              </p>
            </div>
            <span className="font-mono text-[11px] text-slate-400">
              LOCATION // {selectedCity.toUpperCase()}
            </span>
          </div>

          {displayedProducts.length === 0 ? (
            <div className="p-16 text-center rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <Search className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-200">No matching products found</p>
              <p className="text-xs text-slate-400">
                Try clearing search filters or raising the maximum price threshold.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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

      {/* Docked Floating Live Telemetry Inspector */}
      <TelemetryInspector
        isOpen={isTelemetryOpen}
        onClose={() => setIsTelemetryOpen(false)}
      />
    </div>
  );
}

export default App;
