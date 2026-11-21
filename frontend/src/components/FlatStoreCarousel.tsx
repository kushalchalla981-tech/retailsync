import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye } from 'lucide-react';
import { DemoStore } from '../data/stores';
import { storeToTeamMember } from '../data/team';
import { drawPreviewCanvas } from '../webgl/textures';

/**
 * Home carousel for browsers without WebGL: the same store posters as the 3D
 * cards, drawn with Canvas 2D, in a snapping horizontal scroller.
 */
export const FlatStoreCarousel: React.FC<{ stores: DemoStore[]; onOpen: (index: number) => void }> = ({ stores, onOpen }) => {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const posters = useMemo(
    () => stores.map((s, i) => drawPreviewCanvas(storeToTeamMember(s), i).toDataURL('image/jpeg', 0.85)),
    [stores],
  );

  // Vertical wheel scrolls the row, like the 3D carousel.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY, behavior: 'auto' });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const centre = el.scrollLeft + el.clientWidth / 2;
    let best = 0, bestDist = Infinity;
    [...el.children].forEach((c, i) => {
      const card = c as HTMLElement;
      const d = Math.abs(card.offsetLeft + card.offsetWidth / 2 - centre);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    setActive(best);
  };

  const goTo = (i: number) => {
    const card = track.current?.children[i] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  const store = stores[active] ?? stores[0];
  const navBtn = 'p-3 rounded-full bg-white border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 disabled:opacity-30 transition-all';

  return (
    <div className="fixed inset-0 flex flex-col justify-center pt-16 pb-6">
      <div
        ref={track}
        onScroll={onScroll}
        className="flex items-center gap-6 overflow-x-auto overflow-y-hidden snap-x snap-mandatory px-[calc(50vw-min(19.5vh,165px))] py-8 [scrollbar-width:none]"
      >
        {stores.map((s, i) => (
          <button
            key={s.id}
            onClick={() => (i === active ? onOpen(i) : goTo(i))}
            aria-label={`${s.name}, ${s.category} store`}
            className="snap-center shrink-0 h-[min(52vh,440px)] aspect-[3/4] rounded-2xl overflow-hidden shadow-pop-lg transition-transform duration-300"
            style={{ transform: i === active ? 'scale(1) rotate(0deg)' : `scale(.86) rotate(${i < active ? -3 : 3}deg)`, opacity: i === active ? 1 : 0.7 }}
          >
            <img src={posters[i]} alt="" className="w-full h-full object-cover" draggable={false} />
          </button>
        ))}
      </div>

      {store && (
        <div className="text-center space-y-3 px-4">
          <h1 className="font-black text-4xl sm:text-6xl uppercase tracking-tighter text-[#1a1918]">{store.name}</h1>
          <p className="font-mono text-xs sm:text-sm font-bold uppercase tracking-wider text-[#524b44]">
            {store.category} · <span className="text-[#ff5c35]">{store.tagline}</span>
          </p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => goTo(active - 1)} disabled={active === 0} aria-label="Previous store" className={navBtn}><ArrowLeft className="w-4 h-4" /></button>
            <button onClick={() => onOpen(active)} className="flex items-center gap-2 bg-[#1a1918] text-white px-6 py-3 rounded-full font-mono text-xs font-black uppercase tracking-wider shadow-pop hover:bg-[#ff5c35] transition-colors">
              <Eye className="w-4 h-4" /> Explore store
            </button>
            <button onClick={() => goTo(active + 1)} disabled={active >= stores.length - 1} aria-label="Next store" className={navBtn}><ArrowRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
};
