import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

const Bolt = ({ className }: { className: string }) => (
  <svg className={className} width="311" height="6" viewBox="0 0 311 6" fill="none"><path d="M0 1H155.026L144.122 5H311" /></svg>
);

/** Reference preloader: the zig-zag "thunder" line strokes in (#ffcc8e) as assets load, then squashes away. */
export const Preloader: React.FC<{ progress: number; onDone: () => void }> = ({ progress, onDone }) => {
  const root = useRef<HTMLDivElement>(null);
  const path = useRef<SVGPathElement | null>(null);
  const shown = useRef({ value: 0 });
  const done = useRef(false);

  useEffect(() => {
    path.current = root.current!.querySelector('.preloader__svg-progress path');
  }, []);

  useEffect(() => {
    gsap.to(shown.current, {
      value: progress, duration: 0.6, ease: 'cubic.out', overwrite: true,
      onUpdate: () => { path.current?.setAttribute('style', `stroke-dashoffset:${400 - 400 * shown.current.value}`); },
      onComplete: () => {
        if (progress < 1 || done.current) return;
        done.current = true;
        gsap.to(root.current!.querySelectorAll('.preloader__svg'), {
          scaleX: 0, duration: 0.6, ease: 'quart.inOut', delay: 0.15,
          onComplete: () => { gsap.set(root.current, { autoAlpha: 0 }); onDone(); },
        });
      },
    });
  }, [progress, onDone]);

  return (
    <div ref={root} className="preloader">
      <div className="preloader__container">
        <Bolt className="preloader__svg" />
        <Bolt className="preloader__svg preloader__svg-progress" />
      </div>
    </div>
  );
};
