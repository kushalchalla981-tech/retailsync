import React from 'react';
import { ArrowLeft, ArrowRight, Eye, Store } from 'lucide-react';
import { SignUpButton, useUser } from '@clerk/react';
import { DemoStore } from '../data/stores';
import { ThunderLine } from './ThunderLine';
import { sound } from '../utils/sound';

interface TopStoreControlsProps {
  member: DemoStore;
  activeIndex: number;
  totalMembers: number;
  onSelectMember: (store: DemoStore, index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onCreateStore: () => void;
}

export const TopStoreControls: React.FC<TopStoreControlsProps> = ({
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
    <div className="fixed top-14 sm:top-16 left-0 right-0 z-20 pointer-events-none flex flex-col items-center justify-center px-4 space-y-2 animate-fadeIn">
      {/* 1. CTA Buttons Strip (Below the search bar) */}
      <div className="pointer-events-auto flex items-center gap-2 sm:gap-3">
        {/* Previous Store */}
        <button
          onClick={() => {
            sound.playWhoosh(0.9);
            onPrev();
          }}
          disabled={activeIndex === 0}
          aria-label="Previous store"
          className="p-2 sm:p-2.5 rounded-full bg-[#fdf8f3] border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#1a1918]" />
        </button>

        {/* Explore Store CTA */}
        <button
          onClick={() => {
            sound.playCardSelect();
            onSelectMember(member, activeIndex);
          }}
          className="flex items-center gap-1.5 sm:gap-2 bg-[#1a1918] text-[#f5ebe0] px-4 sm:px-5 py-2 sm:py-2.5 rounded-full font-mono text-[11px] sm:text-xs uppercase tracking-widest font-extrabold border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 transition-all hover:bg-[#ff5c35]"
        >
          <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>EXPLORE STORE</span>
        </button>

        {/* Create Store CTA */}
        {isSignedIn ? (
          <button
            onClick={onCreateStore}
            className="flex items-center gap-1.5 sm:gap-2 bg-[#ff5c35] text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-full font-mono text-[11px] sm:text-xs uppercase tracking-widest font-extrabold border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 transition-all hover:bg-[#1a1918]"
          >
            <Store className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>CREATE YOUR STORE</span>
          </button>
        ) : (
          <SignUpButton mode="modal" unsafeMetadata={{ role: 'store_owner' }}>
            <button
              className="flex items-center gap-1.5 sm:gap-2 bg-[#ff5c35] text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-full font-mono text-[11px] sm:text-xs uppercase tracking-widest font-extrabold border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 transition-all hover:bg-[#1a1918]"
            >
              <Store className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>CREATE YOUR STORE</span>
            </button>
          </SignUpButton>
        )}

        {/* Next Store */}
        <button
          onClick={() => {
            sound.playWhoosh(1.1);
            onNext();
          }}
          disabled={activeIndex === totalMembers - 1}
          aria-label="Next store"
          className="p-2 sm:p-2.5 rounded-full bg-[#fdf8f3] border-2 border-[#1a1918] shadow-pop hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#1a1918]" />
        </button>
      </div>

      {/* 2. Store Title & Identity (Center-aligned below CTAs) */}
      <div
        onClick={() => {
          sound.playCardSelect();
          onSelectMember(member, activeIndex);
        }}
        className="pointer-events-auto cursor-pointer group flex flex-col items-center text-center transition-all duration-300 hover:scale-102"
      >
        <div className="relative inline-block">
          <span className="absolute top-0.5 left-0.5 select-none font-black text-2xl sm:text-4xl uppercase tracking-tighter text-[#1a1918]/15 -z-10">
            {member.name}
          </span>
          <h1 className="font-black text-2xl sm:text-4xl uppercase tracking-tighter text-[#1a1918] group-hover:text-[#ff5c35] transition-colors">
            {member.name}
          </h1>
        </div>

        <ThunderLine
          color={member.primaryColor || member.avatarTheme?.primaryColor || '#ff5c35'}
          className="w-44 sm:w-64 h-2.5 sm:h-3 my-0.5"
        />

        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[11px] sm:text-xs uppercase tracking-wider font-bold text-[#1a1918]/70">
            {member.category}
          </span>
          <span className="text-[10px] opacity-40">•</span>
          <span className="font-mono text-[11px] sm:text-xs font-extrabold text-[#ff5c35] bg-[#eedfc8] px-2.5 py-0.5 rounded-full border border-[#1a1918]/15">
            {member.symbol} {member.tagline}
          </span>
        </div>
      </div>
    </div>
  );
};
