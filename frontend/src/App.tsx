import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DEMO_STORES, DemoStore } from './data/stores';
import { ExtendedStore, storeManager } from './data/storeManager';
import { WebGLScene, SceneApi } from './components/WebGLScene';
import { Header } from './components/Header';
import { WorkNames, WorkNamesApi } from './components/WorkNames';
import { Preloader } from './components/Preloader';
import { TransitionBlocks, TransitionApi } from './components/TransitionBlocks';
import { StoreDetailModal } from './components/StoreDetailModal';
import { AboutModal } from './components/AboutModal';
import { AuthModal } from './components/AuthModal';
import { BottomHUD } from './components/BottomHUD';
import { PlatformDashboard } from './components/dashboard/PlatformDashboard';
import { sound } from './utils/sound';

export const App: React.FC = () => {
  const [fontsReady, setFontsReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [stores, setStores] = useState<ExtendedStore[]>(() => storeManager.getStores());
  const [selected, setSelected] = useState<{ member: DemoStore | ExtendedStore; index: number } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(sound.getMuted());

  const scene = useRef<SceneApi | null>(null);
  const names = useRef<WorkNamesApi>(null);
  const transition = useRef<TransitionApi>(null);

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
      names.current?.hide();
      scene.current?.setLocked(true);
    });
  }, []);

  const close = useCallback(() => {
    transition.current?.play(() => {
      setSelected(null);
      scene.current?.setLocked(false);
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

  const toggleAbout = useCallback((v: boolean) => {
    setAboutOpen(v);
    scene.current?.setLocked(v);
    if (v) names.current?.hide();
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
        onSignIn={() => setAuthOpen(true)}
        onOpenDashboard={() => setDashboardOpen(true)}
      />
      <div className="app-wrapper">
        {!ready && <Preloader progress={progress} onDone={() => setReady(true)} />}
        {fontsReady && (
          <WebGLScene
            ready={ready}
            apiRef={scene}
            stores={stores}
            onProgress={setProgress}
            onShowName={(i) => {
              setActiveIndex(i);
              names.current?.show(i);
            }}
            onHideName={() => names.current?.hide()}
            onNameHover={(h) => (h ? names.current?.enter() : names.current?.leave())}
            onSelect={open}
          />
        )}
        <div className="page page--home home">
          {/* screen-reader / keyboard links */}
          <div className="home__links">
            {stores.map((s, i) => (
              <div className="home__link" key={s.id}>
                <a href={`#${s.id}`} onFocus={() => scene.current?.goTo(i)} onClick={(e) => { e.preventDefault(); open(i); }}>{s.name}</a>
              </div>
            ))}
          </div>
          <WorkNames ref={names} stores={stores} onOpen={open} />
        </div>
        <TransitionBlocks ref={transition} />
      </div>

      {ready && !selected && !aboutOpen && !authOpen && (
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
          onCreateStore={() => setDashboardOpen(true)}
        />
      )}

      <StoreDetailModal
        member={selected?.member ?? null}
        currentIndex={selected?.index ?? 0}
        totalStores={stores.length}
        onClose={close}
        onNavigate={navigate}
      />
      <AboutModal isOpen={aboutOpen} onClose={() => toggleAbout(false)} />
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </main>
  );
};

export default App;
