import { forwardRef, useImperativeHandle, useRef } from 'react';
import gsap from 'gsap';

export interface TransitionApi {
  /** Wipes up, calls `mid` while the screen is covered, then wipes away. */
  play: (mid: () => void) => void;
}

const COLORS = ['#ffdeb4', '#ffcc8e', '#ffb4a2', '#f4f0ed'];

export const TransitionBlocks = forwardRef<TransitionApi>((_, ref) => {
  const root = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    play(mid) {
      const els = root.current!.children;
      gsap.killTweensOf(els);
      gsap.set(els, { transformOrigin: 'bottom', scaleY: 0 });
      gsap.timeline()
        .to(els, { scaleY: 1, duration: 0.5, ease: 'quart.inOut', stagger: 0.07 })
        .add(mid)
        .set(els, { transformOrigin: 'top' })
        .to(els, { scaleY: 0, duration: 0.5, ease: 'quart.inOut', stagger: { each: 0.07, from: 'end' } }, '+=0.05');
    },
  }));
  return (
    <div ref={root} className="transition-blocks">
      {COLORS.map((c) => <div key={c} className="transition-blocks__el" style={{ background: c }} />)}
    </div>
  );
});
