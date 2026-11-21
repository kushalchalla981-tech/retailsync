import { DEMO_STORES, DemoStore } from './stores';

export interface TeamMember {
  id: string;
  name: string;
  category?: string;
  role: string;
  products?: { name: string; price: string; emoji: string; image?: string }[];
  superpower: {
    name: string;
    tagline: string;
    description: string;
    icon: string;
  };
  contribution: {
    title: string;
    summary: string;
    highlights: string[];
  };
  tools: string[];
  avatarUrl?: string;
  avatarTheme: {
    bgGradient: string;
    primaryColor: string;
    accentColor: string;
    textColor: string;
    symbol: string;
  };
  socials: {
    github?: string;
    twitter?: string;
    linkedin?: string;
    portfolio?: string;
  };
  quote: string;
}

// Convert DemoStore or ExtendedStore into TeamMember compatible shape for shaders/canvas
export const storeToTeamMember = (s: {
  id: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  highlights?: string[];
  cta?: string;
  symbol: string;
  products?: { name: string; price: string; emoji: string; image?: string }[];
  catalog?: { name: string; price: string; emoji: string; image?: string }[];
  primaryColor?: string;
  accentColor?: string;
  textColor?: string;
  avatarTheme?: {
    bgGradient: string;
    primaryColor: string;
    accentColor: string;
    textColor: string;
    symbol: string;
  };
}): TeamMember => {
  const prods = (s.products && s.products.length > 0)
    ? s.products
    : (s.catalog && s.catalog.length > 0)
    ? s.catalog.map((c) => ({ name: c.name, price: c.price, emoji: c.emoji, image: c.image }))
    : [];

  return {
    id: s.id,
    name: s.name,
    category: s.category,
    role: `${s.category} Store`,
    products: prods,
    superpower: {
      name: s.tagline,
      tagline: s.cta || `Shop ${s.name}`,
      description: s.description,
      icon: s.symbol,
    },
    contribution: {
      title: s.cta || `Shop ${s.name}`,
      summary: s.description,
      highlights: s.highlights || [
        'Instant delivery nationwide',
        'Zero-oversell guaranteed by PostgreSQL locking',
        'Direct checkout with Razorpay UPI & Cards',
      ],
    },
    tools: [s.category, 'Instant Delivery', 'Aiven Powered', 'Zero Oversell'],
    avatarTheme: s.avatarTheme || {
      bgGradient: 'from-amber-400 to-orange-500',
      primaryColor: s.primaryColor || '#ff5c35',
      accentColor: s.accentColor || '#ffd600',
      textColor: s.textColor || '#1a1918',
      symbol: s.symbol || '✦',
    },
    socials: {},
    quote: s.tagline,
  };
};

export const TEAM_MEMBERS: TeamMember[] = DEMO_STORES.map(storeToTeamMember);

export type { DemoStore };
export { DEMO_STORES };
