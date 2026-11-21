export interface StoreProduct {
  name: string;
  price: string;   // INR, e.g. "₹8,999"
  emoji: string;
  image?: string;  // product photo URL
}

const img = (id: string) => `https://images.unsplash.com/photo-${id}?w=600&h=600&fit=crop&q=75&auto=format`;

export interface DemoStore {
  id: string;
  name: string;           // store name
  category: string;       // e.g. "Electronics"
  tagline: string;        // short 1-line pitch
  description: string;   // 2-3 sentence store pitch
  highlights: string[];  // 3 bullet points (what makes it special)
  products: StoreProduct[];
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
      { name: "Noise-Cancelling Headphones", price: "₹8,999", emoji: "🎧", image: img("1505740420928-5e560c06d30e") },
      { name: "Wireless Keyboard", price: "₹5,499", emoji: "⌨️", image: img("1587829741301-dc798b83add3") },
      { name: "Smartwatch Pro", price: "₹12,999", emoji: "⌚", image: img("1523275335684-37898b6baf30") },
      { name: "Mirrorless Camera Kit", price: "₹54,999", emoji: "📷", image: img("1516035069371-29a1b244cc32") },
      { name: "Waterproof Speaker", price: "₹6,499", emoji: "🔊", image: img("1608043152269-423dbba4e7e1") },
      { name: "Ergonomic Mouse", price: "₹1,799", emoji: "🖱️", image: img("1527864550417-7fd91fc51a46") },
      { name: '27" 4K Display', price: "₹32,999", emoji: "🖥️", image: img("1527443224154-c4a3942d3acf") },
      { name: "True Wireless Earbuds", price: "₹4,299", emoji: "🎶", image: img("1590658268037-6bf12165a8df") }
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
      { name: "Oxford Shirt Trio", price: "₹3,299", emoji: "👔", image: img("1602810318383-e386cc2a3ccf") },
      { name: "Denim Overshirt", price: "₹2,499", emoji: "👕", image: img("1596755094514-f87e34085b2c") },
      { name: "Cargo Trousers", price: "₹2,799", emoji: "👖", image: img("1624378439575-d8705ad7ae80") },
      { name: "Canvas Tote", price: "₹899", emoji: "👜", image: img("1544816155-12df9643f363") },
      { name: "Flyknit Runners", price: "₹6,999", emoji: "👟", image: img("1542291026-7eec264c27ff") },
      { name: "Classic Sunglasses", price: "₹1,999", emoji: "🕶️", image: img("1572635196237-14b3f281503f") },
      { name: "Heather Hoodie", price: "₹2,299", emoji: "🧥", image: img("1556821840-3a63f95609a7") },
      { name: "Leather Strap Watch", price: "₹4,999", emoji: "⌚", image: img("1524592094714-0f0654e20314") }
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
      { name: "Cold-Brew Coffee (500ml)", price: "₹349", emoji: "☕", image: img("1461023058943-07fcbe16d735") },
      { name: "Farm Watermelon", price: "₹129", emoji: "🍉", image: img("1587049352846-4a222e784d38") },
      { name: "Himalayan Pink Salt", price: "₹189", emoji: "🧂", image: img("1518110925495-5fe2fda0442c") },
      { name: "Cold-Pressed Orange Juice", price: "₹159", emoji: "🍊", image: img("1600271886742-f049cd451bba") },
      { name: "Extra Virgin Olive Oil", price: "₹899", emoji: "🫒", image: img("1474979266404-7eaacbcd87c5") },
      { name: "Lime Iced Tea", price: "₹139", emoji: "🍹", image: img("1556679343-c7306c1976bc") },
      { name: "Dark Chocolate Slab", price: "₹299", emoji: "🍫", image: img("1606312619070-d48b4c652a52") },
      { name: "Citrus Sparkling Water", price: "₹99", emoji: "🫧", image: img("1517093728432-a0440f8d45af") }
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
      { name: "Milk and Honey (Poetry)", price: "₹499", emoji: "🍯", image: img("1544947950-fa07a98d237f") },
      { name: "Startup Shelf Bundle", price: "₹2,499", emoji: "📚", image: img("1512820790803-83ca734da794") },
      { name: "Sketch Notebook A5", price: "₹399", emoji: "📓", image: img("1531346878377-a5be20888e57") },
      { name: "Fountain Pen", price: "₹1,299", emoji: "🖋️", image: img("1585336261022-680e295ce3fe") },
      { name: "Rare Editions Mystery Box", price: "₹1,999", emoji: "🎁", image: img("1507842217343-583bb7270b66") },
      { name: "Classics Collection", price: "₹1,499", emoji: "📖", image: img("1495446815901-a7297e633e8d") },
      { name: "Lined Notepad", price: "₹249", emoji: "📝", image: img("1517842645767-c639042777db") }
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
      { name: "Daily Face Cream", price: "₹1,299", emoji: "🧴", image: img("1620916566398-39f1143ab7be") },
      { name: "SPF 50 Fluid Sunscreen", price: "₹999", emoji: "☀️", image: img("1556228720-195a672e8a03") },
      { name: "Botanical Face Oil", price: "₹1,799", emoji: "✨", image: img("1611930022073-b7a4ba5fcccd") },
      { name: "Makeup Essentials Kit", price: "₹2,499", emoji: "💄", image: img("1596462502278-27bfdc403348") },
      { name: "Velvet Lipstick", price: "₹699", emoji: "💋", image: img("1586495777744-4413f21062fa") },
      { name: "Clay Detox Mask", price: "₹899", emoji: "🧖", image: img("1570172619644-dfd03ed5d881") },
      { name: "Handmade Soap Set", price: "₹549", emoji: "🧼", image: img("1600857544200-b2f666a9a2ec") }
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
      { name: "Enamel Dutch Oven", price: "₹4,499", emoji: "🍲", image: img("1590794056226-79ef3a8147e1") },
      { name: "Ceramic Cup Set", price: "₹1,799", emoji: "☕", image: img("1495474472287-4d71bcdd2085") },
      { name: "Stoneware Mug", price: "₹449", emoji: "🍵", image: img("1514228742587-6b1558fcca3d") },
      { name: "Succulent in Pot", price: "₹399", emoji: "🪴", image: img("1485955900006-10f4d324d411") },
      { name: "Soy Candle", price: "₹599", emoji: "🕯️", image: img("1602874801007-bd458bb1b8b6") },
      { name: "Task Floor Lamp", price: "₹3,299", emoji: "💡", image: img("1507473885765-e6ed057f782c") },
      { name: "Tufted Accent Chair", price: "₹12,999", emoji: "🪑", image: img("1567538096630-e0c55bd6374c") },
      { name: "Linen Lounge Sofa", price: "₹39,999", emoji: "🛋️", image: img("1578500494198-246f612d3b3d") }
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
