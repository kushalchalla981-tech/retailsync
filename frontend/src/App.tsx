import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DEMO_STORES, DemoStore } from './data/stores';
import { ExtendedStore, storeManager } from './data/storeManager';
import { WebGLScene, SceneApi } from './components/WebGLScene';
import { Header } from './components/Header';
import { Preloader } from './components/Preloader';
import { TransitionBlocks, TransitionApi } from './components/TransitionBlocks';
import { StoreDetailModal } from './components/StoreDetailModal';
import { AboutModal } from './components/AboutModal';
import { BottomHUD } from './components/BottomHUD';
import { FlatStoreCarousel } from './components/FlatStoreCarousel';
import { PlatformDashboard } from './components/dashboard/PlatformDashboard';
import { sound } from './utils/sound';
import { useAuth, useClerk, useUser } from '@clerk/react';
import { useRole } from './utils/roles';
import { CartDrawer } from './components/CartDrawer';
import { useCart } from './context/CartContext';
import { UniversalSearchModal } from './components/UniversalSearchModal';
import { ProfileModal } from './components/ProfileModal';
import { CreateStoreModal } from './components/dashboard/CreateStoreModal';

export const App: React.FC = () => {
  const [fontsReady, setFontsReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [stores, setStores] = useState<ExtendedStore[]>(() => storeManager.getStores());
  const [selected, setSelected] = useState<{ member: DemoStore | ExtendedStore; index: number } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(sound.getMuted());
  const [searchOpen, setSearchOpen] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const { role } = useRole();
  const clerk = useClerk();
  const { getToken, isSignedIn } = useAuth();
  const { user } = useUser();

  // Merchant stores are saved on the server with the signed-in user's Clerk session.
  useEffect(() => { storeManager.setTokenGetter(() => getToken()); }, [getToken]);
  useEffect(() => {
    if (!isSignedIn || !user) return;
    const email = user.primaryEmailAddress?.emailAddress ?? '';
    void storeManager.migrateLegacyStores({ id: user.id, email });
  }, [isSignedIn, user]);
  const { isOpen: cartOpen } = useCart();

  const scene = useRef<SceneApi | null>(null);
  const transition = useRef<TransitionApi>(null);

  // The carousel listens to wheel/drag on the whole window; freeze it whenever anything sits on top of it,
  // otherwise it swallows scrolling inside the store wizard, cart, search, profile and store pages.
  const overlayOpen = Boolean(selected || aboutOpen || searchOpen || profileOpen || creatorOpen || cartOpen);
  useEffect(() => { scene.current?.setLocked(overlayOpen); }, [overlayOpen]);

  // Subscribe to reactive storeManager so new stores created in the dashboard reflect immediately on the homepage
  useEffect(() => {
    const unsub = storeManager.subscribe(() => {
      setStores([...storeManager.getStores()]);
    });
    return unsub;
  }, []);

  // Card preview posters are drawn to canvas with Modak/Inter, so wait for the faces first.
  useEffect(() => {
    Promise.all([document.fonts.load('190px Modak'), document.fonts.load('800 30px Inter'), document.fonts.load('700 20px Inter')])
      .catch(() => {})
      .finally(() => setFontsReady(true));
  }, []);

  const open = useCallback((index: number) => {
    const storeList = storeManager.getStores();
    transition.current?.play(() => {
      setSelected({ member: storeList[index] || storeList[0], index });
    });
  }, []);

  const close = useCallback(() => {
    transition.current?.play(() => {
      setSelected(null);
    });
  }, []);

  const navigate = useCallback((index: number) => {
    const storeList = storeManager.getStores();
    if (index < 0 || index >= storeList.length) return;
    setActiveIndex(index);
    setSelected({ member: storeList[index], index });
    scene.current?.goTo(index);
    sound.playWhoosh(1);
  }, []);

  // ⌘K / Ctrl+K anywhere, or "/" when not typing, opens universal search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Global Escape key coordinator: reliably closes any open modal/overlay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (creatorOpen) { setCreatorOpen(false); return; }
      if (aboutOpen) { setAboutOpen(false); return; }
      if (profileOpen) { setProfileOpen(false); return; }
      if (searchOpen) { setSearchOpen(false); return; }
      if (selected) { close(); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [creatorOpen, aboutOpen, profileOpen, searchOpen, selected, close]);

  /** Owner -> platform dashboard, creator -> store dashboard, visitor -> profile, signed out -> sign in. */
  const openProfile = useCallback(() => {
    if (role === 'owner' || role === 'creator') setDashboardOpen(true);
    else if (role === 'visitor') setProfileOpen(true);
    else clerk.openSignIn();
  }, [role, clerk]);

  const toggleAbout = useCallback((v: boolean) => {
    setAboutOpen(v);
  }, []);

  if (dashboardOpen) {
    return (
      <PlatformDashboard
        onBackToHome={() => {
          setDashboardOpen(false);
          setStores([...storeManager.getStores()]);
        }}
      />
    );
  }

  const activeStore = stores[activeIndex] || stores[0] || DEMO_STORES[0];

  return (
    <main className="main is-page-home">
      <Header
        visible={ready}
        aboutOpen={aboutOpen}
        isMuted={isMuted}
        onHome={() => { if (aboutOpen) toggleAbout(false); else if (selected) close(); }}
        onAbout={() => toggleAbout(!aboutOpen)}
        onToggleSound={() => setIsMuted(sound.toggleMute())}
        onSearch={() => setSearchOpen(true)}
        onProfile={openProfile}
      />
      <div className="app-wrapper">
        {!ready && <Preloader progress={progress} onDone={() => setReady(true)} />}
        {fontsReady && webglOk && (
          <WebGLScene
            ready={ready}
            apiRef={scene}
            stores={stores}
            onProgress={setProgress}
            onShowName={setActiveIndex}
            onHideName={() => {}}
            onNameHover={() => {}}
            onSelect={open}
            onUnsupported={() => { setWebglOk(false); setProgress(1); }}
          />
        )}
        {!webglOk && ready && !selected && <FlatStoreCarousel stores={stores} onOpen={open} />}
        <div className="page page--home home">
          {/* screen-reader / keyboard links */}
          <div className="home__links">
            {stores.map((s, i) => (
              <div className="home__link" key={s.id}>
                <a href={`#${s.id}`} onFocus={() => scene.current?.goTo(i)} onClick={(e) => { e.preventDefault(); open(i); }}>{s.name}</a>
              </div>
            ))}
          </div>
        </div>
        <TransitionBlocks ref={transition} />
      </div>

      {ready && webglOk && !selected && !aboutOpen && !searchOpen && (
        <BottomHUD
          member={activeStore}
          activeIndex={activeIndex}
          totalMembers={stores.length}
          onSelectMember={(_, idx) => open(idx)}
          onPrev={() => {
            const nextIdx = Math.max(0, activeIndex - 1);
            setActiveIndex(nextIdx);
            scene.current?.goTo(nextIdx);
          }}
          onNext={() => {
            const nextIdx = Math.min(stores.length - 1, activeIndex + 1);
            setActiveIndex(nextIdx);
            scene.current?.goTo(nextIdx);
          }}
          onCreateStore={() => setCreatorOpen(true)}
        />
      )}

      <StoreDetailModal
        member={selected ? stores.find((s) => s.id === selected.member.id) ?? selected.member : null}
        currentIndex={selected?.index ?? 0}
        totalStores={stores.length}
        onClose={close}
        onNavigate={navigate}
      />
      <AboutModal isOpen={aboutOpen} onClose={() => toggleAbout(false)} />
      <UniversalSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      <ProfileModal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        onExplore={() => { if (selected) close(); }}
        onCreateStore={() => {
          setProfileOpen(false);
          setCreatorOpen(true);
        }}
        onOpenDashboard={() => {
          setProfileOpen(false);
          setDashboardOpen(true);
        }}
      />
      <CreateStoreModal
        isOpen={creatorOpen}
        onClose={() => setCreatorOpen(false)}
        onStoreCreated={() => {
          setCreatorOpen(false);
          setStores([...storeManager.getStores()]);
          setDashboardOpen(true);
        }}
      />
      <CartDrawer />
    </main>
  );
};

export default App;
