import React, { useEffect, useState } from 'react';

interface CustomCursorProps {
  cursorState: 'default' | 'drag' | 'view' | 'close';
}

export const CustomCursor: React.FC<CustomCursorProps> = ({ cursorState }) => {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [isPointer, setIsPointer] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
      setIsVisible(true);
      
      const target = e.target as HTMLElement | null;
      if (target) {
        const clickable = target.closest('button, a, input, [role="button"]');
        setIsPointer(!!clickable);
      }
    };

    const onMouseLeave = () => setIsVisible(false);

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mouseleave', onMouseLeave);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className="fixed pointer-events-none z-50 transform -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 will-change-transform hidden md:flex items-center justify-center font-bold"
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
      }}
    >
      {cursorState === 'default' && (
        <div
          className={`rounded-full bg-[#1a1918] transition-all duration-200 ${
            isPointer ? 'w-8 h-8 opacity-40 scale-125' : 'w-3.5 h-3.5 opacity-90'
          }`}
        />
      )}

      {cursorState === 'drag' && (
        <div className="bg-[#1a1918] text-[#f5ebe0] text-xs uppercase px-3 py-1.5 rounded-full shadow-pop flex items-center gap-1.5 animate-pulse font-mono tracking-wider">
          <span>⟵</span>
          <span>DRAG</span>
          <span>⟶</span>
        </div>
      )}

      {cursorState === 'view' && (
        <div className="bg-[#ff5c35] text-white text-xs uppercase px-3.5 py-1.5 rounded-full shadow-pop flex items-center gap-1 tracking-wider border-2 border-[#1a1918]">
          <span>POW!</span>
          <span>✦</span>
        </div>
      )}

      {cursorState === 'close' && (
        <div className="bg-[#1a1918] text-white text-xs uppercase px-3 py-1.5 rounded-full shadow-pop flex items-center gap-1 font-mono">
          <span>ESC ✕</span>
        </div>
      )}
    </div>
  );
};
