import React, { useState } from 'react';
import { Palette, Save, Trash2, Eye, Sparkles } from 'lucide-react';
import { ExtendedStore, storeManager } from '../../data/storeManager';

interface CustomizeStoreProps {
  store: ExtendedStore;
  onStoreUpdated: () => void;
  onStoreDeleted?: () => void;
}

const THEME_PRESETS = [
  { name: 'Aurora', primary: '#00e5ff', accent: '#7b4eff', desc: 'Luminous cyans and neon purples with crisp modern feel' },
  { name: 'Sunset', primary: '#ff5c35', accent: '#ffd600', desc: 'Vibrant amber, warm coral, and radiant sunburst yellow' },
  { name: 'Forest', primary: '#a7f432', accent: '#1a1918', desc: 'Organic emerald greens and sharp obsidian contrast' },
  { name: 'Midnight', primary: '#7b4eff', accent: '#00e5ff', desc: 'Deep indigo tones with electrifying neon accents' },
  { name: 'Obsidian', primary: '#1a1918', accent: '#ff5c35', desc: 'Minimal monolithic charcoal with bold signal orange' },
];

export const CustomizeStore: React.FC<CustomizeStoreProps> = ({ store, onStoreUpdated, onStoreDeleted }) => {
  const [storeName, setStoreName] = useState(store.name);
  const [tagline, setTagline] = useState(store.tagline);
  const [description, setDescription] = useState(store.description);
  const [announcement, setAnnouncement] = useState(store.announcement || 'Free express shipping on all orders over ₹999 across India!');
  const [primaryColor, setPrimaryColor] = useState(store.primaryColor);
  const [accentColor, setAccentColor] = useState(store.accentColor);
  const [selectedTheme, setSelectedTheme] = useState(store.themeName || 'Aurora');
  const [contactEmail, setContactEmail] = useState(store.contactEmail || `support@${store.slug}.retailsync.app`);
  const [contactPhone, setContactPhone] = useState(store.contactPhone || '+91 98765 43210');
  const [contactAddress, setContactAddress] = useState(store.contactAddress || 'Bengaluru, Karnataka, India');
  const [isSaved, setIsSaved] = useState(false);

  const applyPreset = (preset: typeof THEME_PRESETS[0]) => {
    setSelectedTheme(preset.name as any);
    setPrimaryColor(preset.primary);
    setAccentColor(preset.accent);
  };

  const handleSaveChanges = (e: React.FormEvent) => {
    e.preventDefault();
    storeManager.updateStore(store.id, {
      name: storeName,
      tagline,
      description,
      announcement,
      primaryColor,
      accentColor,
      themeName: selectedTheme as any,
      contactEmail,
      contactPhone,
      contactAddress,
    });
    setIsSaved(true);
    onStoreUpdated();
    setTimeout(() => setIsSaved(false), 2500);
  };

  const handleDeleteStore = () => {
    if (confirm(`CRITICAL: Are you sure you want to permanently delete store "${store.name}"? This removes all associated products and orders from the platform.`)) {
      storeManager.deleteStore(store.id);
      if (onStoreDeleted) {
        onStoreDeleted();
      } else {
        onStoreUpdated();
      }
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
      {/* Left Column: Customization Controls (7 cols) */}
      <form onSubmit={handleSaveChanges} className="lg:col-span-7 space-y-6">
        {/* Header (sticky so Save stays reachable at any scroll depth) */}
        <div className="sticky top-0 z-20 bg-[#fdfaf6] p-5 rounded-2xl border-3 border-[#1a1918] shadow-pop">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-[#ff5c35]" />
                <h2 className="font-black text-xl uppercase tracking-tight text-[#1a1918]">
                  Customize Store: {store.name}
                </h2>
              </div>
              <p className="text-xs font-mono text-[#786f66] mt-0.5">
                Changes update in real-time across your live customer storefront
              </p>
            </div>
            <button
              type="submit"
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono text-xs uppercase tracking-wider font-black border-2 border-[#1a1918] shadow-pop transition-all ${
                isSaved ? 'bg-[#a7f432] text-[#1a1918]' : 'bg-[#1a1918] text-white hover:bg-[#ff5c35]'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>{isSaved ? 'Saved! ✓' : 'Save Changes'}</span>
            </button>
          </div>
        </div>

        {/* Theme Presets */}
        <div className="bg-[#fdfaf6] p-5 rounded-2xl border-3 border-[#1a1918] shadow-pop space-y-3">
          <div className="flex items-center justify-between">
            <label className="font-mono text-xs font-black uppercase text-[#1a1918] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#ff5c35]" />
              Preset Theme
            </label>
            <span className="text-xs font-mono text-[#786f66]">5 curated styles</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {THEME_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className={`p-3 rounded-xl border-2 text-left font-mono transition-all ${
                  selectedTheme === preset.name
                    ? 'border-[#1a1918] bg-[#1a1918] text-white shadow-pop'
                    : 'border-[#1a1918]/30 bg-[#f4f0ed] text-[#1a1918] hover:border-[#1a1918]'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-black text-xs uppercase">{preset.name}</span>
                  <div className="flex gap-1">
                    <span className="w-3 h-3 rounded-full border border-black/30" style={{ backgroundColor: preset.primary }} />
                    <span className="w-3 h-3 rounded-full border border-black/30" style={{ backgroundColor: preset.accent }} />
                  </div>
                </div>
                <p className="text-[10px] opacity-75 line-clamp-1">{preset.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Colors */}
        <div className="bg-[#fdfaf6] p-5 rounded-2xl border-3 border-[#1a1918] shadow-pop space-y-3">
          <label className="font-mono text-xs font-black uppercase text-[#1a1918] block">
            Custom Colors
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-[11px] font-mono text-[#786f66] block mb-1">Primary Color</span>
              <div className="flex items-center gap-2 bg-[#f4f0ed] p-2 rounded-xl border-2 border-[#1a1918]">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-8 h-8 rounded border-0 cursor-pointer"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-full bg-transparent font-mono text-xs font-bold text-[#1a1918] uppercase focus:outline-none"
                />
              </div>
            </div>

            <div>
              <span className="text-[11px] font-mono text-[#786f66] block mb-1">Accent Color</span>
              <div className="flex items-center gap-2 bg-[#f4f0ed] p-2 rounded-xl border-2 border-[#1a1918]">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-8 h-8 rounded border-0 cursor-pointer"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-full bg-transparent font-mono text-xs font-bold text-[#1a1918] uppercase focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Announcement Bar & Hero Banner */}
        <div className="bg-[#fdfaf6] p-5 rounded-2xl border-3 border-[#1a1918] shadow-pop space-y-4">
          <div>
            <label className="font-mono text-xs font-black uppercase text-[#1a1918] block mb-1">
              Store Brand Name
            </label>
            <input
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="e.g. CircuitHub"
              className="w-full px-3.5 py-2.5 bg-[#f4f0ed] border-2 border-[#1a1918] rounded-xl font-mono text-xs font-bold text-[#1a1918] focus:outline-none"
            />
          </div>

          <div>
            <label className="font-mono text-xs font-black uppercase text-[#1a1918] block mb-1">
              Top Announcement Bar
            </label>
            <input
              type="text"
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              placeholder="e.g. Free express delivery on all orders over ₹999"
              className="w-full px-3.5 py-2.5 bg-[#f4f0ed] border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] focus:outline-none"
            />
          </div>

          <div>
            <label className="font-mono text-xs font-black uppercase text-[#1a1918] block mb-1">
              Store Tagline &amp; Banner
            </label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#f4f0ed] border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] focus:outline-none"
            />
          </div>

          <div>
            <label className="font-mono text-xs font-black uppercase text-[#1a1918] block mb-1">
              Store Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#f4f0ed] border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] focus:outline-none resize-none"
            />
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-[#fdfaf6] p-5 rounded-2xl border-3 border-[#1a1918] shadow-pop space-y-3">
          <label className="font-mono text-xs font-black uppercase text-[#1a1918] block">
            Customer Contact Information
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-[11px] font-mono text-[#786f66] block mb-1">Support Email</span>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full px-3 py-2 bg-[#f4f0ed] border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] focus:outline-none"
              />
            </div>
            <div>
              <span className="text-[11px] font-mono text-[#786f66] block mb-1">Contact Phone</span>
              <input
                type="text"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full px-3 py-2 bg-[#f4f0ed] border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] focus:outline-none"
              />
            </div>
          </div>
          <div>
            <span className="text-[11px] font-mono text-[#786f66] block mb-1">Business Address</span>
            <input
              type="text"
              value={contactAddress}
              onChange={(e) => setContactAddress(e.target.value)}
              className="w-full px-3 py-2 bg-[#f4f0ed] border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] focus:outline-none"
            />
          </div>
        </div>

        {/* Danger Zone: Delete Store */}
        <div className="bg-[#ff5c35]/10 p-5 rounded-2xl border-2 border-[#ff5c35] space-y-2">
          <div className="flex items-center gap-2 text-[#ff5c35]">
            <Trash2 className="w-4 h-4" />
            <h4 className="font-mono text-xs font-black uppercase tracking-wider">Danger Zone</h4>
          </div>
          <p className="text-xs text-[#524b44]">
            Permanently delete <span className="font-bold text-[#1a1918]">{store.name}</span>, including its inventory and orders. This action cannot be undone.
          </p>
          <button
            type="button"
            onClick={handleDeleteStore}
            className="bg-[#ff5c35] text-white px-4 py-2 rounded-xl font-mono text-xs font-black uppercase tracking-wider hover:bg-[#1a1918] transition-colors shadow-pop"
          >
            Delete {store.name}
          </button>
        </div>
      </form>

      {/* Right Column: Live Storefront Preview (5 cols) - Mirroring StoreForge HTML */}
      <div className="lg:col-span-5 space-y-4">
        <div className="lg:sticky lg:top-0 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto overscroll-contain">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="font-mono text-xs font-black uppercase text-[#1a1918] flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-[#ff5c35]" />
              Live Storefront Preview
            </span>
            <span className="font-mono text-[10px] text-[#786f66] bg-[#f0e5d8] px-2 py-0.5 rounded-full border border-[#1a1918]/20">
              /{store.slug}
            </span>
          </div>

          {/* Device Mockup Shell */}
          <div className="bg-[#1a1918] p-3 rounded-3xl border-4 border-[#1a1918] shadow-pop-lg">
            <div className="bg-white rounded-2xl overflow-hidden border border-[#1a1918]/20 text-left font-sans">
              {/* Preview Announcement Bar */}
              <div
                className="px-3 py-1 text-center text-[10px] font-mono font-bold text-white transition-colors"
                style={{ backgroundColor: primaryColor }}
              >
                {announcement}
              </div>

              {/* Preview Header */}
              <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-5 h-5 rounded-md flex items-center justify-center text-xs text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {store.symbol}
                  </div>
                  <span className="font-bold text-xs text-slate-900">{storeName}</span>
                </div>
                <div className="flex gap-2 text-[10px] font-mono text-slate-500">
                  <span>Shop</span>
                  <span>About</span>
                  <span>Contact</span>
                </div>
              </div>

              {/* Preview Hero Banner */}
              <div
                className="p-5 text-center text-white transition-colors"
                style={{ backgroundColor: primaryColor }}
              >
                <div className="inline-block px-2 py-0.5 rounded-full text-[9px] font-mono font-bold mb-1 uppercase bg-black/20">
                  {store.category} Store
                </div>
                <h3 className="text-base font-black uppercase tracking-tight">{storeName}</h3>
                <p className="text-[11px] opacity-90 mt-0.5 font-mono">{tagline}</p>
              </div>

              {/* Preview Products Grid */}
              <div className="p-3 bg-slate-50 space-y-2">
                <div className="flex justify-between items-center text-[10px] font-mono font-bold text-slate-600 px-1">
                  <span>Featured Products</span>
                  <span className="text-[9px] text-slate-400">3 items</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {store.catalog.slice(0, 4).map((p) => (
                    <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm">
                      <div className="h-12 bg-slate-100 rounded-lg flex items-center justify-center text-xl mb-1.5">
                        {p.emoji}
                      </div>
                      <div className="text-[11px] font-bold text-slate-900 truncate">{p.name}</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[11px] font-mono font-black" style={{ color: primaryColor }}>
                          {p.price}
                        </span>
                        <span className="text-[9px] font-mono text-slate-400">
                          {p.stock} in stock
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview Footer */}
              <div className="px-3 py-2 text-center text-[9px] font-mono bg-[#1a1918] text-white/60">
                © {storeName} · Powered by RetailSync · Aiven Cluster
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
