import { useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * One fitted display line (Broadside): never wraps, and its size is set from its
 * measured width so it fills its column exactly. Refits on resize and font load.
 */
export function FitLine({ children, className = '', max = 220 }: { children: ReactNode; className?: string; max?: number }) {
  const el = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const node = el.current;
    const parent = node?.parentElement;
    if (!node || !parent) return;
    const fit = () => {
      node.style.fontSize = '100px';
      const ratio = parent.clientWidth / node.scrollWidth;
      node.style.fontSize = `${Math.min(max, Math.floor(100 * ratio * 0.995))}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(parent);
    void document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [children, max]);

  return (
    <span ref={el} className={`fit ${className}`}>
      {children}
    </span>
  );
}
