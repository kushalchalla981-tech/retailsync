import React from 'react';
import { ShieldAlert, X, Lock } from 'lucide-react';
import { ThunderLine } from '../ThunderLine';

interface AccessDeniedModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail?: string;
}

export const AccessDeniedModal: React.FC<AccessDeniedModalProps> = ({
  isOpen,
  onClose,
  currentUserEmail,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#1a1918]/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
      <div className="fixed inset-0 -z-10" onClick={onClose} />
      <div
        className="relative w-full max-w-md bg-[#fdfaf6] border-4 border-[#1a1918] rounded-3xl shadow-pop-lg overflow-hidden my-auto p-6 md:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b-2 border-[#1a1918]/15">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-[#ff5c35]" />
            <span className="font-mono text-xs font-black uppercase tracking-wider text-[#ff5c35]">
              ACCESS RESTRICTED
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full bg-[#1a1918] text-white hover:bg-[#ff5c35] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-center py-6 space-y-4">
          <div className="w-16 h-16 bg-[#ff5c35]/15 border-3 border-[#ff5c35] rounded-full flex items-center justify-center mx-auto shadow-pop">
            <Lock className="w-8 h-8 text-[#ff5c35]" />
          </div>

          <h3 className="font-black text-2xl uppercase tracking-tight text-[#1a1918]">
            Platform Owner Only
          </h3>
          <ThunderLine color="#ff5c35" className="w-32 h-2.5 mx-auto" />

          <p className="text-sm text-[#5a534d] leading-relaxed">
            Store management and administrative controls are restricted to the verified platform owner:
          </p>

          <div className="bg-[#1a1918] text-[#a7f432] p-3 rounded-2xl font-mono text-xs font-bold border-2 border-[#1a1918]">
            kushalchalla981@gmail.com
          </div>

          {currentUserEmail ? (
            <p className="text-xs text-[#786f66] font-mono">
              Signed in as: <span className="font-bold text-[#1a1918]">{currentUserEmail}</span> (Visitor role)
            </p>
          ) : (
            <p className="text-xs text-[#786f66] font-mono">
              Please sign in with the platform owner account.
            </p>
          )}

          <div className="pt-2">
            <button
              onClick={onClose}
              className="w-full bg-[#1a1918] text-white py-3 rounded-xl font-mono text-xs uppercase tracking-widest font-black border-2 border-[#1a1918] shadow-pop hover:bg-[#ff5c35] transition-all"
            >
              Back to Store Showcase
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
