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
  owner: { label: 'Platform Dashboard', Icon: Crown },
  creator: { label: 'Store Dashboard', Icon: Store },
  visitor: { label: 'Profile & Orders', Icon: User },
} as const;

/** Mirrors the reference `.app-header`: name left, links right with the thunder underline when active. */
export const Header: React.FC<HeaderProps> = ({ visible, aboutOpen, isMuted, onHome, onAbout, onToggleSound, onSearch, onProfile }) => {
  const { role } = useRole();
  const { count, setOpen } = useCart();
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

  return (
    <header className={`app-header items-center ${visible ? 'app-header--in' : ''}`}>
      <a href="/" className={!aboutOpen ? 'router-link-active' : ''} onClick={(e) => { e.preventDefault(); onHome(); }}>
        RetailSync
      </a>
      {/* Search sits at the top centre, independent of the nav. */}
      <button
        onClick={onSearch}
        aria-label="Search all stores"
        className={`${pill} bg-[#fdfaf6] absolute left-1/2 top-9 sm:top-0 -translate-x-1/2 px-4 py-1.5 sm:min-w-[260px] justify-between`}
      >
        <span className="flex items-center gap-1.5"><Search className="w-3.5 h-3.5" /><span className="hidden sm:inline">Search stores</span></span>
        <kbd className="hidden md:inline text-[10px] opacity-60">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <nav className="flex items-center flex-nowrap">
        {/* Quick Dashboard shortcut for owner / creator */}
        {role === 'owner' && (
          <button onClick={onProfile} className={`${pill} bg-[#a7f432] text-[#1a1918] mr-2`} aria-label="Platform Dashboard">
            <Crown className="w-3.5 h-3.5 text-[#1a1918]" />
            <span className="hidden md:inline">Dashboard</span>
          </button>
        )}
        {role === 'creator' && (
          <button onClick={onProfile} className={`${pill} bg-[#ffd600] text-[#1a1918] mr-2`} aria-label="Store Dashboard">
            <Store className="w-3.5 h-3.5 text-[#1a1918]" />
            <span className="hidden md:inline">My Store</span>
          </button>
        )}
        <CurrencySelect className="mr-2" />
        {/* Cart appears once something is in it, with a pop. */}
        {count > 0 && (
          <button key={count} onClick={() => setOpen(true)} aria-label={`Open cart, ${count} items`} className={`${pill} bg-[#ff5c35] text-white mr-2 animate-pop`}>
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>{count}</span>
          </button>
        )}
        {/* Tapping the avatar shows the role's destination (e.g. Dashboard) in Clerk's menu. */}
        {role !== 'guest' ? (
          <UserButton>
            {(() => {
              const { label, Icon } = PROFILE[role];
              return (
                <UserButton.MenuItems>
                  <UserButton.Action label={label} labelIcon={<Icon className="w-4 h-4" />} onClick={onProfile} />
                  <UserButton.Action label="manageAccount" />
                  <UserButton.Action label="signOut" />
                </UserButton.MenuItems>
              );
            })()}
          </UserButton>
        ) : (
          <SignInButton mode="modal">
            <a href="#signin" onClick={(e) => e.preventDefault()} className="cursor-pointer">
              <span>Sign in</span>
            </a>
          </SignInButton>
        )}
        <a href="#sound" className="app-header__sound" onClick={(e) => { e.preventDefault(); onToggleSound(); }}>
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
