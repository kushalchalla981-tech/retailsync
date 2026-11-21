import { DEMO_STORES, DemoStore } from './stores';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
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
export const storeToTeamMember = (s: DemoStore | {
  id: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  highlights?: string[];
  cta?: string;
  symbol: string;
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
}): TeamMember => ({
  id: s.id,
  name: s.name,
  role: `${s.category} Store`,
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
});

export const TEAM_MEMBERS: TeamMember[] = DEMO_STORES.map(storeToTeamMember);

export type { DemoStore };
export { DEMO_STORES };
