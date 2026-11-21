import React from 'react';
import { ArrowLeft, ArrowRight, Eye, Store } from 'lucide-react';
import { SignUpButton, useUser } from '@clerk/react';
import { DemoStore } from '../data/stores';
import { ThunderLine } from './ThunderLine';
import { sound } from '../utils/sound';

interface BottomHUDProps {
  member: DemoStore;
  activeIndex: number;
  totalMembers: number;
  onSelectMember: (store: DemoStore, index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onCreateStore: () => void;
}

export const BottomHUD: React.FC<BottomHUDProps> = ({
  member,
  activeIndex,
  totalMembers,
  onSelectMember,
  onPrev,
  onNext,
  onCreateStore,
}) => {
  const { isSignedIn } = useUser();

  return (
    <div className="fixed bottom-6 left-0 right-0 z-20 pointer-events-none flex flex-col items-center justify-center px-4">
      {/* Title & Animated Squiggly Underline */}
      <div 
        onClick={() => {
          sound.playCardSelect();
          onSelectMember(member, activeIndex);
        }}
        className="pointer-events-auto cursor-pointer group flex flex-col items-center text-center transition-all duration-300 hover:scale-105"
      >
        <div className="relative inline-block mb-1">
          <span className="absolute top-1 left-1 select-none font-black text-3xl md:text-5xl uppercase tracking-tighter text-[#1a1918]/15 -z-10">
            {member.name}
          </span>
          <h1 className="font-black text-3xl md:text-5xl uppercase tracking-tighter text-[#1a1918] group-hover:text-[#ff5c35] transition-colors">
            {member.name}
          </h1>
        </div>

        <ThunderLine color={member.primaryColor || member.avatarTheme?.primaryColor || '#ff5c35'} className="w-56 md:w-80 h-4 my-1" />

        <div className="flex items-center gap-2 mt-1">
          <span className="font-mono text-xs md:text-sm uppercase tracking-wider font-bold text-[#1a1918]/70">
            {member.category}
          </span>
          <span className="text-xs opacity-40">•</span>
          <span className="font-mono text-xs md:text-sm font-extrabold text-[#ff5c35] bg-[#eedfc8] px-2.5 py-0.5 rounded-full border border-[#1a1918]/15">
            {member.symbol} {member.tagline}
          </span>
        </div>
      </div>

      {/* Floating navigation controls & Click CTA */}
      <div className="pointer-events-auto flex items-center gap-3 mt-4">
        {/* Prev Card */}
        <button
          onClick={() => {
            sound.playWhoosh(0.9);
            onPrev();
          }}
          disabled={activeIndex === 0}
          aria-label="Previous demo store"
          className="p-2.5 rounded-full bg-[#fdf8f3] border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ArrowLeft className="w-4 h-4 text-[#1a1918]" />
        </button>

        {/* Explore Store CTA Button */}
        <button
          onClick={() => {
            sound.playCardSelect();
            onSelectMember(member, activeIndex);
          }}
          className="flex items-center gap-2 bg-[#1a1918] text-[#f5ebe0] px-5 py-2.5 rounded-full font-mono text-xs uppercase tracking-widest font-extrabold border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 transition-all hover:bg-[#ff5c35]"
        >
          <Eye className="w-4 h-4" />
          <span>EXPLORE STORE</span>
        </button>

        {/* Create Store CTA Button */}
        {isSignedIn ? (
          <button
            onClick={onCreateStore}
            className="flex items-center gap-2 bg-[#ff5c35] text-white px-5 py-2.5 rounded-full font-mono text-xs uppercase tracking-widest font-extrabold border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 transition-all hover:bg-[#1a1918]"
          >
            <Store className="w-4 h-4" />
            <span>CREATE YOUR STORE</span>
          </button>
        ) : (
          <SignUpButton mode="modal" unsafeMetadata={{ role: 'store_owner' }}>
            <button
              className="flex items-center gap-2 bg-[#ff5c35] text-white px-5 py-2.5 rounded-full font-mono text-xs uppercase tracking-widest font-extrabold border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 transition-all hover:bg-[#1a1918]"
            >
              <Store className="w-4 h-4" />
              <span>CREATE YOUR STORE</span>
            </button>
          </SignUpButton>
        )}

        {/* Next Card */}
        <button
          onClick={() => {
            sound.playWhoosh(1.1);
            onNext();
          }}
          disabled={activeIndex === totalMembers - 1}
          aria-label="Next demo store"
          className="p-2.5 rounded-full bg-[#fdf8f3] border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ArrowRight className="w-4 h-4 text-[#1a1918]" />
        </button>
      </div>
    </div>
  );
};
