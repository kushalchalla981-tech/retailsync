import React, { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/react';
import { X, ArrowRight, ArrowLeft, Sparkles, CheckCircle2 } from 'lucide-react';
import { ExtendedStore, storeManager } from '../../data/storeManager';
import { ThunderLine } from '../ThunderLine';

interface CreateStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStoreCreated: (newStore: ExtendedStore) => void;
}

const BUSINESS_TYPES = [
  { id: 'Fashion & Apparel', icon: '👔', desc: 'Clothing, footwear, and accessories' },
  { id: 'Electronics & Tech', icon: '⚡', desc: 'Hardware, gadgets, and peripherals' },
  { id: 'Home & Decor', icon: '⌂', desc: 'Furniture, kitchenware, and living' },
  { id: 'Food & Beverage', icon: '🌿', desc: 'Pantry, artisanal foods, and drinks' },
  { id: 'Sports & Fitness', icon: '🏃', desc: 'Gear, equipment, and activewear' },
  { id: 'Books & Stationery', icon: '📚', desc: 'Literature, journals, and art supplies' },
  { id: 'General Retail', icon: '🛍️', desc: 'Multi-category department goods' },
];

const THEMES = [
  { name: 'Aurora', primary: '#00e5ff', accent: '#7b4eff', desc: 'Luminous cyans and neon purples with modern feel' },
  { name: 'Sunset', primary: '#ff5c35', accent: '#ffd600', desc: 'Warm corals, rich amber, and golden highlights' },
  { name: 'Forest', primary: '#a7f432', accent: '#1a1918', desc: 'Organic emerald greens with sharp obsidian contrast' },
  { name: 'Midnight', primary: '#7b4eff', accent: '#00e5ff', desc: 'Deep cosmic indigos and radiant neon blues' },
  { name: 'Obsidian', primary: '#1a1918', accent: '#ff5c35', desc: 'Monolithic deep charcoal with signal orange' },
];

export const CreateStoreModal: React.FC<CreateStoreModalProps> = ({ isOpen, onClose, onStoreCreated }) => {
  const { user } = useUser();
  const userEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase() || '';
  const userName = user?.fullName || userEmail.split('@')[0] || 'Merchant';
  const [step, setStep] = useState(1);
  const body = useRef<HTMLDivElement>(null);
  // Each step starts at its top instead of inheriting the previous step's scroll position.
  useEffect(() => { body.current?.scrollTo({ top: 0, behavior: 'smooth' }); }, [step]);

  // Step 1: Store Information
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [symbol, setSymbol] = useState('✨');
  const [description, setDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('+91 98765 43210');
  const [contactAddress, setContactAddress] = useState('Bengaluru, Karnataka, India');

  // Step 2: Business Type & Categories
  const [businessType, setBusinessType] = useState('Electronics & Tech');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['Gadgets', 'Peripherals']);

  // Step 3: Choose a Theme
  const [selectedTheme, setSelectedTheme] = useState('Aurora');
  const [primaryColor, setPrimaryColor] = useState('#00e5ff');
  const [accentColor, setAccentColor] = useState('#7b4eff');

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    setName(val);
    setSlug(val.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
  };

  const handleThemeSelect = (t: typeof THEMES[0]) => {
    setSelectedTheme(t.name);
    setPrimaryColor(t.primary);
    setAccentColor(t.accent);
  };

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleFinalSubmit = async () => {
    setSaving(true);
    setSaveError(null);
    try {
    const category = businessType.split(' ')[0] || 'Retail';
    const newStore = await storeManager.createStore({
      name: name || 'New Store',
      category,
      ownerEmail: userEmail || 'merchant@retailsync.app',
      ownerName: userName,
      tagline: description.slice(0, 50) || `Curated ${category} store`,
      description: description || `Welcome to ${name}, proudly powered by RetailSync.`,
      highlights: [
        'Instant delivery nationwide',
        'Zero-oversell guaranteed by PostgreSQL locking',
        'Direct checkout with Razorpay UPI & Cards'
      ],
      primaryColor,
      accentColor,
      textColor: '#1a1918',
      symbol: symbol || '🛍️',
      slug: slug || `store-${Date.now()}`,
      cta: `Shop ${name}`,
      businessType,
      themeName: selectedTheme as any,
      announcement: `Grand opening sale at ${name}! Free shipping on all orders.`,
      bannerTitle: name,
      contactEmail: contactEmail || 'owner@retailsync.app',
      contactPhone,
      contactAddress,
      catalog: [
        {
          id: `sample-1`,
          name: `${name} Signature Product`,
          price: '₹2,499',
          emoji: symbol || '✨',
          stock: 23,
          sku: `RS-${slug.slice(0, 3).toUpperCase()}-001`,
          category,
          description: `Flagship item launched with ${name}. Stock initialized at baseline safety threshold.`
        },
        {
          id: `sample-2`,
          name: `Essential Starter Pack`,
          price: '₹1,299',
          emoji: '📦',
          stock: 129,
          sku: `RS-${slug.slice(0, 3).toUpperCase()}-002`,
          category,
          description: `Everything you need to get started with ${name}. Stock initialized at warehouse top line cap.`
        }
      ]
    });

    onStoreCreated(newStore);
    onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not create the store. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[105] overflow-y-auto overscroll-contain bg-[#1a1918]/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="fixed inset-0 -z-10" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl bg-[#fdfaf6] border-4 border-[#1a1918] rounded-3xl shadow-pop-lg overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="bg-[#1a1918] text-white px-6 py-4 border-b-4 border-[#1a1918] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#a7f432]">
                STORE CREATOR WIZARD
              </span>
              <span className="bg-white/20 text-white font-mono text-[10px] font-black px-2 py-0.5 rounded-full">
                STEP {step} OF 4
              </span>
            </div>
            <h3 className="font-black text-xl uppercase tracking-tighter mt-0.5">
              Create Your Store
            </h3>
            <ThunderLine color="#a7f432" className="w-32 h-2 mt-1" />
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/10 text-white hover:bg-[#ff5c35] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Progression Indicators */}
        <div className="bg-[#eedfc8] px-6 py-2.5 border-b-2 border-[#1a1918] flex items-center justify-between font-mono text-xs font-bold text-[#1a1918]">
          <span className={step === 1 ? 'text-[#ff5c35] font-black' : 'opacity-60'}>1. Info</span>
          <span>→</span>
          <span className={step === 2 ? 'text-[#ff5c35] font-black' : 'opacity-60'}>2. Business</span>
          <span>→</span>
          <span className={step === 3 ? 'text-[#ff5c35] font-black' : 'opacity-60'}>3. Theme</span>
          <span>→</span>
          <span className={step === 4 ? 'text-[#ff5c35] font-black' : 'opacity-60'}>4. Deploy</span>
        </div>

        {/* Body content */}
        <div ref={body} className="overflow-y-auto overscroll-contain scroll-smooth p-6 space-y-6">
          {/* STEP 1: Store Information */}
          {step === 1 && (
            <div className="space-y-4 animate-fadeIn">
              <div>
                <h4 className="font-black text-lg uppercase tracking-tight text-[#1a1918]">
                  Store Information
                </h4>
                <p className="text-xs font-mono text-[#786f66]">
                  Enter your store's brand identity and contact information.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-3">
                  <label className="block font-mono text-xs font-bold uppercase text-[#1a1918] mb-1">
                    Store Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. NeoKraft Studio"
                    className="w-full px-3.5 py-2.5 bg-white border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] focus:outline-none shadow-pop"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="block font-mono text-xs font-bold uppercase text-[#1a1918] mb-1">
                    Store Logo / Symbol
                  </label>
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border-2 border-[#1a1918] rounded-xl font-mono text-xl text-center text-[#1a1918] focus:outline-none shadow-pop"
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono text-xs font-bold uppercase text-[#1a1918] mb-1">
                  Store Slug (URL Handle)
                </label>
                <div className="flex items-center bg-[#f4f0ed] border-2 border-[#1a1918] rounded-xl px-3 py-2 text-xs font-mono text-[#786f66]">
                  <span>retailsync.app/</span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="neokraft-studio"
                    className="flex-1 bg-transparent font-bold text-[#1a1918] focus:outline-none ml-1"
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono text-xs font-bold uppercase text-[#1a1918] mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what your store creates, crafts, or delivers..."
                  className="w-full px-3.5 py-2.5 bg-white border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] focus:outline-none shadow-pop resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-xs font-bold uppercase text-[#1a1918] mb-1">
                    Contact Email *
                  </label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="owner@brand.com"
                    className="w-full px-3 py-2 bg-white border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-mono text-xs font-bold uppercase text-[#1a1918] mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono text-xs font-bold uppercase text-[#1a1918] mb-1">
                  Business / Store Address
                </label>
                <input
                  type="text"
                  value={contactAddress}
                  onChange={(e) => setContactAddress(e.target.value)}
                  placeholder="e.g. Indiranagar, Bengaluru, Karnataka, India"
                  className="w-full px-3 py-2 bg-white border-2 border-[#1a1918] rounded-xl font-mono text-xs text-[#1a1918] focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* STEP 2: Business Type & Categories */}
          {step === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <div>
                <h4 className="font-black text-lg uppercase tracking-tight text-[#1a1918]">
                  Business Type &amp; Categories
                </h4>
                <p className="text-xs font-mono text-[#786f66]">
                  What type of products will this store showcase?
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {BUSINESS_TYPES.map((bt) => (
                  <button
                    type="button"
                    key={bt.id}
                    onClick={() => setBusinessType(bt.id)}
                    className={`p-3.5 rounded-2xl border-2 text-left transition-all flex items-start gap-3 ${
                      businessType === bt.id
                        ? 'border-[#1a1918] bg-[#1a1918] text-white shadow-pop'
                        : 'border-[#1a1918]/30 bg-[#f4f0ed] text-[#1a1918] hover:border-[#1a1918]'
                    }`}
                  >
                    <span className="text-2xl p-1 bg-white/10 rounded-xl">{bt.icon}</span>
                    <div>
                      <div className="font-mono text-xs font-black uppercase">{bt.id}</div>
                      <div className="text-[11px] opacity-75 mt-0.5">{bt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="pt-3 border-t-2 border-[#1a1918]/10">
                <label className="block font-mono text-xs font-bold uppercase text-[#1a1918] mb-2">
                  Product Category Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {['Gadgets', 'Peripherals', 'Wearables', 'Audio', 'Home Office', 'Accessories', 'Apparel', 'Artisanal'].map((tag) => {
                    const isSelected = selectedCategories.includes(tag);
                    return (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => {
                          setSelectedCategories((prev) =>
                            isSelected ? prev.filter((t) => t !== tag) : [...prev, tag]
                          );
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-mono font-bold border-2 transition-all ${
                          isSelected
                            ? 'bg-[#ff5c35] text-white border-[#1a1918] shadow-sm'
                            : 'bg-white text-[#1a1918] border-[#1a1918]/30 hover:border-[#1a1918]'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}{tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Choose a Theme */}
          {step === 3 && (
            <div className="space-y-4 animate-fadeIn">
              <div>
                <h4 className="font-black text-lg uppercase tracking-tight text-[#1a1918]">
                  Choose a Storefront Theme
                </h4>
                <p className="text-xs font-mono text-[#786f66]">
                  Select the visual styling and color harmony for your storefront.
                </p>
              </div>

              <div className="space-y-3">
                {THEMES.map((t) => (
                  <button
                    type="button"
                    key={t.name}
                    onClick={() => handleThemeSelect(t)}
                    className={`w-full p-4 rounded-2xl border-2 text-left flex items-center justify-between transition-all ${
                      selectedTheme === t.name
                        ? 'border-[#1a1918] bg-[#1a1918] text-white shadow-pop'
                        : 'border-[#1a1918]/30 bg-[#f4f0ed] text-[#1a1918] hover:border-[#1a1918]'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-black uppercase">{t.name}</span>
                        {selectedTheme === t.name && (
                          <span className="bg-[#a7f432] text-[#1a1918] text-[10px] font-mono font-black px-2 py-0.5 rounded-full">
                            SELECTED
                          </span>
                        )}
                      </div>
                      <p className="text-xs opacity-75">{t.desc}</p>
                    </div>

                    <div className="flex items-center gap-2 pl-4">
                      <div
                        className="w-7 h-7 rounded-full border-2 border-white/60 shadow-sm"
                        style={{ backgroundColor: t.primary }}
                        title="Primary Color"
                      />
                      <div
                        className="w-7 h-7 rounded-full border-2 border-white/60 shadow-sm"
                        style={{ backgroundColor: t.accent }}
                        title="Accent Color"
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: Review & Deploy Store */}
          {step === 4 && (
            <div className="space-y-5 animate-fadeIn">
              <div>
                <h4 className="font-black text-lg uppercase tracking-tight text-[#1a1918]">
                  Review &amp; Deploy Store
                </h4>
                <p className="text-xs font-mono text-[#786f66]">
                  Confirm your store configuration before provisioning to the Aiven cluster.
                </p>
              </div>

              {/* Summary Card */}
              <div className="bg-[#eedfc8] rounded-2xl p-5 border-3 border-[#1a1918] shadow-pop space-y-3">
                <div className="flex items-center justify-between border-b border-[#1a1918]/20 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-3xl p-1 bg-white rounded-xl border border-[#1a1918]">{symbol}</span>
                    <div>
                      <h5 className="font-black text-xl text-[#1a1918]">{name || 'Unnamed Store'}</h5>
                      <span className="font-mono text-xs text-[#ff5c35] font-bold">/{slug}</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="w-5 h-5 rounded-full border border-black/30" style={{ backgroundColor: primaryColor }} />
                    <span className="w-5 h-5 rounded-full border border-black/30" style={{ backgroundColor: accentColor }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <span className="text-[#786f66] block">Business Type</span>
                    <span className="font-bold text-[#1a1918]">{businessType}</span>
                  </div>
                  <div>
                    <span className="text-[#786f66] block">Theme</span>
                    <span className="font-bold text-[#1a1918]">{selectedTheme}</span>
                  </div>
                  <div>
                    <span className="text-[#786f66] block">Contact</span>
                    <span className="font-bold text-[#1a1918]">{contactEmail || 'owner@retailsync.app'}</span>
                  </div>
                  <div>
                    <span className="text-[#786f66] block">Aiven Cloud Infra</span>
                    <span className="font-bold text-[#a7f432] bg-[#1a1918] px-1.5 py-0.5 rounded">
                      AUTO-PROVISIONED
                    </span>
                  </div>
                </div>
              </div>

              {/* Guarantees Box */}
              <div className="bg-white p-4 rounded-xl border-2 border-[#1a1918] space-y-2">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#1a1918]">
                  <CheckCircle2 className="w-4 h-4 text-[#a7f432]" />
                  <span>PostgreSQL schema &amp; table isolation auto-configured</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#1a1918]">
                  <CheckCircle2 className="w-4 h-4 text-[#a7f432]" />
                  <span>Kafka topic <code className="bg-black/5 px-1 rounded">orders.placed</code> subscribed</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#1a1918]">
                  <CheckCircle2 className="w-4 h-4 text-[#a7f432]" />
                  <span>OpenSearch fuzzy catalog index initialized</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {saveError && (
          <p role="alert" className="px-6 py-2 bg-[#ff5c35] text-white font-mono text-xs font-bold border-t-2 border-[#1a1918]">{saveError}</p>
        )}
        {/* Footer controls */}
        <div className="bg-[#eedfc8] px-6 py-4 border-t-2 border-[#1a1918] flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1.5 px-4 py-2 bg-white text-[#1a1918] rounded-xl font-mono text-xs font-bold border-2 border-[#1a1918] hover:bg-[#f5ede4]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              disabled={step === 1 && !name.trim()}
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-1.5 px-5 py-2 bg-[#1a1918] text-white rounded-xl font-mono text-xs font-black uppercase tracking-wider border-2 border-[#1a1918] shadow-pop hover:bg-[#ff5c35] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinalSubmit}
              disabled={saving}
              className="disabled:opacity-60 disabled:cursor-wait flex items-center gap-2 px-6 py-2.5 bg-[#a7f432] text-[#1a1918] rounded-xl font-mono text-xs font-black uppercase tracking-wider border-2 border-[#1a1918] shadow-pop hover:bg-[#1a1918] hover:text-white transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>{saving ? 'Launching…' : 'Launch Store on Platform ➔'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
