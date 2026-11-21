export interface DemoStore {
  id: string;
  name: string;           // store name
  category: string;       // e.g. "Electronics"
  tagline: string;        // short 1-line pitch
  description: string;   // 2-3 sentence store pitch
  highlights: string[];  // 3 bullet points (what makes it special)
  products: { name: string; price: string; emoji: string }[]; // 3 sample products
  primaryColor: string;
  accentColor: string;
  textColor: string;
  symbol: string;
  slug: string;           // URL slug e.g. "circuithub"
  cta: string;            // e.g. "Shop Electronics"
  bgGradient?: string;   // keep for card texture compat
  // Compat shims so existing WebGL texture code (avatarTheme) still works:
  avatarTheme: {
    primaryColor: string;
    accentColor: string;
    textColor: string;
    symbol: string;
    bgGradient: string;
  };
}

export const DEMO_STORES: DemoStore[] = [
  {
    id: "store-1",
    name: "CircuitHub",
    category: "Electronics",
    tagline: "Pro gear for builders & makers",
    description: "From MCUs to 4K monitors, CircuitHub stocks everything the modern maker needs. Fast delivery, genuine parts, zero-compromise specs.",
    highlights: ["Same-day dispatch on 10k+ SKUs", "Expert reviews on every product", "Price-match guarantee"],
    products: [
      { name: "Noise-Cancelling Headphones", price: "₹8,999", emoji: "🎧" },
      { name: "Mechanical Keyboard", price: "₹5,499", emoji: "⌨️" },
      { name: "USB-C Hub Pro", price: "₹2,199", emoji: "🔌" }
    ],
    primaryColor: "#00e5ff",
    accentColor: "#7b4eff",
    textColor: "#1a1918",
    symbol: "⚡",
    slug: "circuithub",
    cta: "Shop Electronics",
    avatarTheme: { primaryColor: "#00e5ff", accentColor: "#7b4eff", textColor: "#1a1918", symbol: "⚡", bgGradient: "from-cyan-400 to-purple-600" }
  },
  {
    id: "store-2",
    name: "Threadline",
    category: "Fashion",
    tagline: "Minimal cuts. Maximum presence.",
    description: "Clean silhouettes, premium fabrics, and timeless fits — Threadline is fashion stripped of noise, built to last.",
    highlights: ["Ethically sourced materials", "Size-inclusive range XS–4XL", "Free returns within 30 days"],
    products: [
      { name: "Linen Overshirt", price: "₹3,299", emoji: "👔" },
      { name: "Cargo Trousers", price: "₹2,799", emoji: "👖" },
      { name: "Canvas Tote", price: "₹899", emoji: "👜" }
    ],
    primaryColor: "#ff5c35",
    accentColor: "#ffd600",
    textColor: "#1a1918",
    symbol: "✦",
    slug: "threadline",
    cta: "Shop Fashion",
    avatarTheme: { primaryColor: "#ff5c35", accentColor: "#ffd600", textColor: "#1a1918", symbol: "✦", bgGradient: "from-orange-500 to-yellow-400" }
  },
  {
    id: "store-3",
    name: "Peel & Pour",
    category: "Grocery",
    tagline: "Artisan pantry, delivered fresh",
    description: "Small-batch jams, single-origin coffees, craft hot sauces, and cold-pressed juices — Peel & Pour brings the farmers market to your door.",
    highlights: ["Sourced from 80+ local farms", "Zero plastic packaging", "Next-day delivery across 12 cities"],
    products: [
      { name: "Cold-Brew Coffee (500ml)", price: "₹349", emoji: "☕" },
      { name: "Mango Chilli Jam", price: "₹249", emoji: "🍯" },
      { name: "Himalayan Pink Salt", price: "₹189", emoji: "🧂" }
    ],
    primaryColor: "#a7f432",
    accentColor: "#ff5c35",
    textColor: "#1a1918",
    symbol: "🌿",
    slug: "peelandpour",
    cta: "Shop Grocery",
    avatarTheme: { primaryColor: "#a7f432", accentColor: "#ff5c35", textColor: "#1a1918", symbol: "🌿", bgGradient: "from-lime-400 to-orange-500" }
  },
  {
    id: "store-4",
    name: "Folio & Spine",
    category: "Books",
    tagline: "Curated reads for curious minds",
    description: "Independent bookstore championing debut authors, niche non-fiction, and collector editions. Every order ships with a handwritten note.",
    highlights: ["Curated by genre experts", "Rare & out-of-print finds", "Personalised reading lists"],
    products: [
      { name: "The Design of Everyday Things", price: "₹699", emoji: "📐" },
      { name: "Atomic Habits", price: "₹499", emoji: "⚛️" },
      { name: "Leather Journal A5", price: "₹1,299", emoji: "📓" }
    ],
    primaryColor: "#ffd600",
    accentColor: "#ff5c35",
    textColor: "#1a1918",
    symbol: "📚",
    slug: "foliospine",
    cta: "Shop Books",
    avatarTheme: { primaryColor: "#ffd600", accentColor: "#ff5c35", textColor: "#1a1918", symbol: "📚", bgGradient: "from-yellow-400 to-orange-500" }
  },
  {
    id: "store-5",
    name: "Lumière",
    category: "Beauty",
    tagline: "Science-backed, planet-first skincare",
    description: "Dermatologist-formulated serums, SPF, and cleansers for every skin type — Lumière combines clinical efficacy with zero-harm ingredients.",
    highlights: ["Cruelty-free & vegan certified", "Clinically tested formulas", "Refillable packaging on all products"],
    products: [
      { name: "Vitamin C Serum 20%", price: "₹1,799", emoji: "✨" },
      { name: "SPF 50 Fluid Sunscreen", price: "₹999", emoji: "☀️" },
      { name: "Barrier Repair Moisturiser", price: "₹1,499", emoji: "💧" }
    ],
    primaryColor: "#ff4382",
    accentColor: "#ffd600",
    textColor: "#ffffff",
    symbol: "❋",
    slug: "lumiere",
    cta: "Shop Beauty",
    avatarTheme: { primaryColor: "#ff4382", accentColor: "#ffd600", textColor: "#ffffff", symbol: "❋", bgGradient: "from-pink-500 to-yellow-400" }
  },
  {
    id: "store-6",
    name: "Hearthware",
    category: "Home Goods",
    tagline: "Objects that earn their place",
    description: "Minimal, durable homewares chosen for longevity — from cast-iron cookware to handwoven throws, everything at Hearthware is built to outlast trends.",
    highlights: ["10-year quality guarantee", "Designed by independent makers", "Carbon-neutral shipping"],
    products: [
      { name: "Cast Iron Skillet 26cm", price: "₹4,499", emoji: "🍳" },
      { name: "Linen Throw Blanket", price: "₹2,899", emoji: "🛋️" },
      { name: "Ceramic Pour-Over Set", price: "₹1,799", emoji: "☕" }
    ],
    primaryColor: "#c97d4e",
    accentColor: "#f5ebe0",
    textColor: "#1a1918",
    symbol: "⌂",
    slug: "hearthware",
    cta: "Shop Home",
    avatarTheme: { primaryColor: "#c97d4e", accentColor: "#f5ebe0", textColor: "#1a1918", symbol: "⌂", bgGradient: "from-amber-600 to-amber-100" }
  }
];
