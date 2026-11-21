import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import gsap from 'gsap';
import { DEMO_STORES, DemoStore } from '../data/stores';
import { ExtendedStore } from '../data/storeManager';

export interface WorkNamesApi {
  show: (index: number) => void;
  hide: () => void;
  enter: () => void;
  leave: () => void;
}

const back = (a: number) => `back.out(${a})`;

function split(el: HTMLElement, text: string) {
  el.innerHTML = '';
  return [...text].map((ch) => {
    const s = document.createElement('span');
    s.textContent = ch === ' ' ? ' ' : ch;
    s.style.display = 'inline-block';
    el.appendChild(s);
    return s;
  });
}

export const WorkNames = forwardRef<WorkNamesApi, { stores?: (DemoStore | ExtendedStore)[]; onOpen: (index: number) => void }>(({ stores, onOpen }, ref) => {
  const root = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLDivElement>(null);
  const title2 = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const type = useRef<HTMLDivElement>(null);
  const state = useRef({ shown: false, entered: false, current: -1, chars2: [] as HTMLElement[] });

  useImperativeHandle(ref, () => ({
    show(index) {
      const storeList = stores && stores.length > 0 ? stores : DEMO_STORES;
      const m = storeList[index];
      if (!m || !root.current) return;
      const s = state.current;
      s.shown = true; s.current = index;
      gsap.killTweensOf([root.current, title.current, type.current, bar.current]);
      gsap.set(bar.current, { scaleX: 0 });
      const c1 = split(title.current!, m.name.toLowerCase());
      const c2 = split(title2.current!, m.name.toLowerCase());
      s.chars2 = c2;
      title2.current!.style.color = m.primaryColor;
      type.current!.textContent = `${m.category.toUpperCase()} STORE`;
      gsap.set(root.current, { autoAlpha: 1 });
      gsap.set(title.current, { autoAlpha: 1, y: 0 });
      gsap.set(c1, { scaleY: 0, y: 10, opacity: 1 });
      gsap.to(c1, { scaleY: 1, y: 0, transformOrigin: 'bottom', duration: 0.8, stagger: { from: 'center', amount: 0.1 }, ease: back(1.3) });
      gsap.set(c2, { scaleY: 0, y: 10, opacity: 0.2 });
      gsap.to(c2, {
        scaleY: 1, y: 0, transformOrigin: 'bottom', duration: 0.8, stagger: { from: 'edges', amount: 0.1 }, ease: back(1.8),
        onComplete: () => { gsap.to(c2, { autoAlpha: 0, duration: 0.1 }); },
      });
      gsap.set(type.current, { opacity: 0, y: 10 });
      gsap.to(type.current, { opacity: 1, duration: 0.3, delay: 0.2, ease: 'none' });
      gsap.to(type.current, { y: 1, duration: 0.5, delay: 0.2, ease: back(2.5) });
    },
    hide() {
      const s = state.current;
      if (!s.shown) return;
      s.shown = false;
      gsap.killTweensOf([title.current, type.current, bar.current]);
      gsap.to([title.current, type.current, bar.current], { opacity: 0, duration: 0.3 });
      gsap.to(root.current, { autoAlpha: 0, duration: 0, delay: 0.1 });
    },
    enter() {
      const s = state.current;
      if (s.entered || !s.shown) return;
      s.entered = true;
      gsap.killTweensOf(s.chars2);
      gsap.set(bar.current, { scaleX: 0.8, opacity: 0 });
      gsap.to(bar.current, { scaleX: 1, opacity: 1, duration: 0.2, ease: 'cubic.out' });
      gsap.to([title.current, title2.current], { y: -4, duration: 0.2, ease: 'cubic.out' });
      gsap.to(type.current, { y: 5, duration: 0.2, ease: 'cubic.out' });
      gsap.set(s.chars2, { autoAlpha: 0.5, scaleY: 0, y: 10 });
      gsap.to(s.chars2, {
        scaleY: 1, y: 0, transformOrigin: 'bottom', duration: 1, stagger: { from: 'center', amount: 0.1 }, ease: back(2),
        onComplete: () => { gsap.to(s.chars2, { autoAlpha: 0, duration: 0.1 }); },
      });
    },
    leave() {
      const s = state.current;
      if (!s.entered) return;
      s.entered = false;
      gsap.to(bar.current, { opacity: 0, duration: 0.2, ease: 'cubic.in' });
      gsap.to([title.current, title2.current], { y: 0, duration: 0.2, ease: 'cubic.out' });
      gsap.to(type.current, { y: 0, duration: 0.2, ease: 'cubic.out' });
    },
  }));

  useEffect(() => () => { gsap.killTweensOf([root.current, title.current, type.current, bar.current]); }, []);

  const api = () => (ref && typeof ref === 'object' ? ref.current : null);
  return (
    <div
      ref={root}
      className="work-names"
      onClick={() => state.current.current >= 0 && onOpen(state.current.current)}
      onMouseEnter={() => api()?.enter()}
      onMouseMove={() => api()?.enter()}
      onMouseLeave={() => api()?.leave()}
    >
      <div ref={title} className="work-names__title" />
      <span ref={bar} className="work-names__bar">
        <svg width="311" height="6" viewBox="0 0 311 6" fill="none"><path d="M0 1H155.026L144.122 5H311" stroke="black" /></svg>
      </span>
      <div ref={title2} className="work-names__title work-names__title-2" />
      <div ref={type} className="work-names__type" />
    </div>
  );
});
