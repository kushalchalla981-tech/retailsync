import React from 'react';
import { useUser, UserButton, SignInButton } from '@clerk/react';
import { Crown } from 'lucide-react';

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
  onSignIn?: () => void;
  onOpenDashboard?: () => void;
}

/** Mirrors the reference `.app-header`: name left, ABOUT right with the thunder underline when active. */
export const Header: React.FC<HeaderProps> = ({
  visible,
  aboutOpen,
  isMuted,
  onHome,
  onAbout,
  onToggleSound,
  onOpenDashboard
}) => {
  const { isSignedIn, user } = useUser();
  const userEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase() || '';
  const isPlatformOwner = userEmail === 'kushalchalla981@gmail.com';

  return (
    <header className={`app-header ${visible ? 'app-header--in' : ''}`}>
      <a href="/" className={!aboutOpen ? 'router-link-active' : ''} onClick={(e) => { e.preventDefault(); onHome(); }}>
        RetailSync
      </a>
      <nav>
        {isPlatformOwner && onOpenDashboard && (
          <button
            onClick={onOpenDashboard}
            className="flex items-center gap-1.5 bg-[#a7f432] text-[#1a1918] px-3 py-1 rounded-full font-mono text-xs font-black uppercase border border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 transition-transform cursor-pointer mr-2"
          >
            <Crown className="w-3.5 h-3.5 text-[#1a1918]" />
            <span>Dashboard</span>
          </button>
        )}
        {isSignedIn ? (
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
