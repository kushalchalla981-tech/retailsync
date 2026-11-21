import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DEMO_STORES, DemoStore } from './data/stores';
import { ExtendedStore, storeManager } from './data/storeManager';
import { WebGLScene, SceneApi } from './components/WebGLScene';
import { Header } from './components/Header';
import { Preloader } from './components/Preloader';
import { TransitionBlocks, TransitionApi } from './components/TransitionBlocks';
import { StoreDetailModal } from './components/StoreDetailModal';
import { AboutModal } from './components/AboutModal';
import { TopStoreControls } from './components/TopStoreControls';
import { StartGuideModal } from './components/StartGuideModal';
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
import { VoiceAgentOrb } from './components/voice/VoiceAgentOrb';
import { useVoiceAgent } from './hooks/useVoiceAgent';
import { emitCreateInput, type LedgerService, type VoiceAction } from './voice/types';
import { askGemma } from './voice/api';
import { answer } from './utils/assistantBrain';
import { recentTelemetry } from './utils/telemetry';
import { STOCK_BASELINE, STOCK_TOPLINE } from './data/storeManager';

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
  const [guideOpen, setGuideOpen] = useState(false);
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
  const { isOpen: cartOpen, setOpen: setCartOpen } = useCart();
  const [voiceQuery, setVoiceQuery] = useState<string | undefined>();
  const [aboutLedger, setAboutLedger] = useState<LedgerService | null>(null);
  const voiceCreated = useRef(false);

  const scene = useRef<SceneApi | null>(null);
  const transition = useRef<TransitionApi>(null);

  // The carousel listens to wheel/drag on the whole window; freeze it whenever anything sits on top of it,
  // otherwise it swallows scrolling inside the store wizard, cart, search, profile and store pages.
  const overlayOpen = Boolean(selected || aboutOpen || searchOpen || profileOpen || creatorOpen || cartOpen || guideOpen);
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
      if (guideOpen) { setGuideOpen(false); return; }
      if (creatorOpen) { setCreatorOpen(false); return; }
      if (aboutOpen) { setAboutOpen(false); return; }
      if (profileOpen) { setProfileOpen(false); return; }
      if (searchOpen) { setSearchOpen(false); return; }
      if (selected) { close(); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guideOpen, creatorOpen, aboutOpen, profileOpen, searchOpen, selected, close]);

  /** Owner -> platform dashboard, creator -> store dashboard, visitor -> profile, signed out -> sign in. */
  const openProfile = useCallback(() => {
    if (role === 'owner' || role === 'creator') setDashboardOpen(true);
    else if (role === 'visitor') setProfileOpen(true);
    else clerk.openSignIn();
  }, [role, clerk]);

  const toggleAbout = useCallback((v: boolean) => {
    setAboutOpen(v);
  }, []);

  /** Voice agent (v1.06): turn each classified action into the same UI change a click would make. */
  const executeVoice = async (a: VoiceAction): Promise<string | null | undefined> => {
    // Navigation targets the showcase; leave the dashboard first.
    const leaveDashboard = dashboardOpen && a.type !== 'CLOSE_OVERLAY' && a.type !== 'AI_QUERY';
    if (leaveDashboard) setDashboardOpen(false);
    switch (a.type) {
      case 'NAVIGATE_STORE': {
        const i = stores.findIndex((s) => s.id === a.storeId);
        if (i < 0) return "I couldn't find that store.";
        setSearchOpen(false); setAboutOpen(false); setProfileOpen(false); setCartOpen(false); setGuideOpen(false);
        setActiveIndex(i);
        scene.current?.goTo(i);
        if (selected) navigate(i); else open(i);
        return undefined;
      }
      case 'STEP_STORE': {
        const base = selected ? selected.index : activeIndex;
        const i = base + (a.direction === 'next' ? 1 : -1);
        if (i < 0 || i >= stores.length) return a.direction === 'next' ? "That's the last store." : "That's the first store.";
        if (selected) navigate(i);
        else { setActiveIndex(i); scene.current?.goTo(i); sound.playWhoosh(1); }
        return `${stores[i].name}.`;
      }
      case 'OPEN_MODULE':
        if (a.module === 'cart') setCartOpen(true);
        else if (a.module === 'search') { setVoiceQuery(a.query); setSearchOpen(true); }
        else if (a.module === 'about' || a.module === 'ledger') { setAboutLedger(a.module === 'ledger' ? a.service ?? null : null); setAboutOpen(true); }
        else if (a.module === 'dashboard') {
          if (role === 'owner' || role === 'creator') setDashboardOpen(true);
          else if (!isSignedIn) { clerk.openSignIn(); return 'Please sign in first, then I can open your dashboard.'; }
          else return 'You don\'t have a store yet. Say "create a store" and I\'ll help you build one.';
        }
        return undefined;
      case 'CLOSE_MODULE':
        setCartOpen(false);
        return undefined;
      case 'CLOSE_OVERLAY': {
        if (cartOpen) { setCartOpen(false); return undefined; }
        if (guideOpen) { setGuideOpen(false); return undefined; }
        if (!(dashboardOpen || selected || aboutOpen || searchOpen || profileOpen || creatorOpen)) return 'Nothing is open.';
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        return undefined;
      }
      case 'CREATE_STORE_INPUT':
        if (a.field === 'submit') {
          if (!isSignedIn) { clerk.openSignIn(); return 'Please sign in first, then say "launch it" again.'; }
          voiceCreated.current = true;
        }
        setCreatorOpen(true);
        // Leaving the dashboard remounts the showcase wizard; give it a tick to start listening.
        if (leaveDashboard) window.setTimeout(() => emitCreateInput(a), 80); else emitCreateInput(a);
        return undefined;
      case 'AI_QUERY': {
        const current = selected ? stores.find((s) => s.id === selected.member.id) : undefined;
        const scope = current ? [current] : stores;
        const brainCtx = {
          storeName: current?.name ?? 'RetailSync',
          category: current?.category ?? 'multi-store',
          tagline: current?.tagline ?? '',
          catalog: scope.flatMap((s) => s.catalog),
          orders: storeManager.getOrders().filter((o) => scope.some((s) => s.id === o.storeId)),
          telemetry: recentTelemetry(),
          baseline: STOCK_BASELINE,
          topline: STOCK_TOPLINE,
        };
        // 1. Try local Gemma 3:4B via backend first
        try {
          const gemma = await askGemma(a.query, {
            storeName: brainCtx.storeName,
            category: brainCtx.category,
            catalog: brainCtx.catalog.map((p) => ({ name: p.name, price: p.price, stock: p.stock })),
            ordersCount: brainCtx.orders.length,
          });
          if (gemma.reply) return gemma.reply;
        } catch {
          // fallback to deterministic assistantBrain
        }
        return answer(a.query, brainCtx).text;
      }
      default:
        return undefined;
    }
  };
  const voice = useVoiceAgent({ stores: () => storeManager.getStores().map((s) => ({ id: s.id, name: s.name })), execute: executeVoice });
  const orb = (
    <VoiceAgentOrb
      status={voice.status}
      level={voice.level}
      heard={voice.heard}
      reply={voice.reply}
      error={voice.error}
      handsFree={voice.handsFree}
      wakeSupported={voice.wakeSupported}
      onToggleHandsFree={voice.setHandsFree}
      onActivate={voice.toggle}
    />
  );

  if (dashboardOpen) {
    return (
      <>
      {orb}
      <PlatformDashboard
        onBackToHome={() => {
          setDashboardOpen(false);
          setStores([...storeManager.getStores()]);
        }}
      />
      </>
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
        onGuide={() => setGuideOpen(true)}
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

      {ready && webglOk && !selected && !aboutOpen && !searchOpen && !guideOpen && (
        <TopStoreControls
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
      <AboutModal
        isOpen={aboutOpen}
        initialLedger={aboutLedger}
        onOpenTour={() => setGuideOpen(true)}
        onClose={() => { toggleAbout(false); setAboutLedger(null); }}
      />
      <UniversalSearchModal isOpen={searchOpen} initialQuery={voiceQuery} onClose={() => { setSearchOpen(false); setVoiceQuery(undefined); }} />
      <StartGuideModal
        isOpen={guideOpen}
        onClose={() => {
          setGuideOpen(false);
          try { localStorage.setItem('retailsync_guide_seen', '1'); } catch {}
        }}
        onOpenLedger={(service) => {
          setGuideOpen(false);
          setAboutLedger(service);
          setAboutOpen(true);
        }}
        onOpenSearch={() => {
          setGuideOpen(false);
          setSearchOpen(true);
        }}
        onOpenCreator={() => {
          setGuideOpen(false);
          setCreatorOpen(true);
        }}
      />
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
        onStoreCreated={(created) => {
          setCreatorOpen(false);
          const list = storeManager.getStores();
          setStores([...list]);
          if (voiceCreated.current) {
            // Voice launch: show the new card on the showcase instead of jumping to the dashboard.
            voiceCreated.current = false;
            const i = list.findIndex((s) => s.id === created.id);
            if (i >= 0) { setActiveIndex(i); scene.current?.goTo(i); }
            void voice.say(`${created.name} is live. You'll find it on the showcase.`);
          } else setDashboardOpen(true);
        }}
      />
      <CartDrawer />
      {orb}
    </main>
  );
};

export default App;
