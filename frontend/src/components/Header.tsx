import React from 'react';
import { UserButton, SignInButton } from '@clerk/react';
import { Crown, Search, ShoppingCart, Store, User } from 'lucide-react';
import { useRole } from '../utils/roles';
import { useCart } from '../context/CartContext';
import { CurrencySelect } from './CurrencySelect';

const Bolt = () => (
  <div className="app-header__svg-c">
    <svg width="311" height="6" viewBox="0 0 311 6" fill="none"><path d="M0 1H155.026L144.122 5H311" /></svg>
  </div>
);

interface HeaderProps {
  visible: boolean;
  aboutOpen: boolean;
  isMuted: boolean;
  onHome: () => void;
  onAbout: () => void;
  onToggleSound: () => void;
  onSearch: () => void;
  /** Role-aware: owner -> dashboard, creator -> store creator, visitor -> profile. */
  onProfile: () => void;
}

const pill = 'flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-xs font-black uppercase border border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 transition-transform cursor-pointer';

const PROFILE = {
  owner: { label: 'Dashboard', Icon: Crown, cls: 'bg-[#a7f432]' },
  creator: { label: 'My store', Icon: Store, cls: 'bg-[#ffd600]' },
  visitor: { label: 'Profile', Icon: User, cls: 'bg-[#fdfaf6]' },
} as const;

/** Mirrors the reference `.app-header`: name left, links right with the thunder underline when active. */
export const Header: React.FC<HeaderProps> = ({ visible, aboutOpen, isMuted, onHome, onAbout, onToggleSound, onSearch, onProfile }) => {
  const { role } = useRole();
  const { count, setOpen } = useCart();
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

  return (
    <header className={`app-header ${visible ? 'app-header--in' : ''}`}>
      <a href="/" className={!aboutOpen ? 'router-link-active' : ''} onClick={(e) => { e.preventDefault(); onHome(); }}>
        RetailSync
      </a>
      <nav className="items-center">
        <button onClick={onSearch} aria-label="Search all stores" className={`${pill} bg-[#fdfaf6] mr-2`}>
          <Search className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden md:inline text-[10px] opacity-60">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
        <CurrencySelect className="mr-2" />
        <button onClick={() => setOpen(true)} aria-label={`Open cart, ${count} items`} className={`${pill} bg-[#ff5c35] text-white mr-2 relative`}>
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>{count}</span>
        </button>
        {role !== 'guest' && (() => {
          const { label, Icon, cls } = PROFILE[role];
          return (
            <button onClick={onProfile} className={`${pill} ${cls} text-[#1a1918] mr-2`}>
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          );
        })()}
        {role !== 'guest' ? (
          <UserButton />
        ) : (
          <SignInButton mode="modal">
            <a href="#signin" onClick={(e) => e.preventDefault()} className="cursor-pointer">
              <span>Sign in</span>
            </a>
          </SignInButton>
        )}
        <a href="#sound" onClick={(e) => { e.preventDefault(); onToggleSound(); }}>
          <span>{isMuted ? 'Sound off' : 'Sound on'}</span>
        </a>
        <a href="/about" className={aboutOpen ? 'router-link-active' : ''} onClick={(e) => { e.preventDefault(); onAbout(); }}>
          <span>About</span>
          <Bolt />
        </a>
      </nav>
    </header>
  );
};
