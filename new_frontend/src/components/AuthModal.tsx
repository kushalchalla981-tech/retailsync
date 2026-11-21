import React from 'react';
import { X, Store, ShoppingBag } from 'lucide-react';
import { useClerk } from '@clerk/react';
import { ThunderLine } from './ThunderLine';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { openSignIn, openSignUp } = useClerk();
  const key =
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
    import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const hasKey = key && !key.includes('placeholder');

  if (!isOpen) return null;

  const handleOwnerSignUp = () => {
    onClose();
    openSignUp({ unsafeMetadata: { role: 'store_owner' } });
  };

  const handleBuyerSignUp = () => {
    onClose();
    openSignUp({ unsafeMetadata: { role: 'buyer' } });
  };

  const handleSignIn = () => {
    onClose();
    openSignIn();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#1a1918]/70 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
      <div className="fixed inset-0 -z-10" onClick={onClose} />
      <div
        className="relative w-full max-w-lg bg-[#fdfaf6] border-4 border-[#1a1918] rounded-3xl shadow-pop-lg overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#1a1918] px-6 py-4 border-b-4 border-[#1a1918] flex items-center justify-between">
          <div>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#a7f432]">
              RetailSync Platform
            </span>
            <h3 className="font-black text-xl uppercase tracking-tighter text-white mt-0.5">
              Join the Platform
            </h3>
            <ThunderLine color="#a7f432" className="w-32 h-2 mt-1" />
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/10 text-white hover:bg-[#ff5c35] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {!hasKey ? (
            /* Placeholder when no Clerk key configured */
            <div className="text-center space-y-4 py-8">
              <div className="text-4xl">🔑</div>
              <h4 className="font-black text-lg text-[#1a1918]">Auth Coming Soon</h4>
              <p className="text-sm text-[#5a534d]">
                Clerk authentication is integrated and ready. Add your{' '}
                <code className="bg-[#f0e5d8] px-1.5 py-0.5 rounded font-mono text-xs">
                  VITE_CLERK_PUBLISHABLE_KEY
                </code>{' '}
                to{' '}
                <code className="bg-[#f0e5d8] px-1.5 py-0.5 rounded font-mono text-xs">
                  .env.local
                </code>{' '}
                to activate sign-in.
              </p>
            </div>
          ) : (
            /* Role Choice */
            <div className="space-y-4">
              <p className="text-sm text-[#5a534d] font-medium text-center">
                What brings you to RetailSync?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleOwnerSignUp}
                  className="group flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-[#1a1918] bg-[#f4f0ed] hover:bg-[#1a1918] transition-all hover:-translate-y-1 shadow-pop"
                >
                  <Store className="w-8 h-8 text-[#ff5c35] group-hover:text-[#ffd600] transition-colors" />
                  <div className="text-center">
                    <div className="font-black text-sm uppercase tracking-tight text-[#1a1918] group-hover:text-white transition-colors">
                      I want to sell
                    </div>
                    <div className="text-xs text-[#7a736d] group-hover:text-white/60 transition-colors mt-0.5">
                      Create &amp; manage a store
                    </div>
                  </div>
                </button>
                <button
                  onClick={handleBuyerSignUp}
                  className="group flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-[#1a1918] bg-[#f4f0ed] hover:bg-[#1a1918] transition-all hover:-translate-y-1 shadow-pop"
                >
                  <ShoppingBag className="w-8 h-8 text-[#7b4eff] group-hover:text-[#00e5ff] transition-colors" />
                  <div className="text-center">
                    <div className="font-black text-sm uppercase tracking-tight text-[#1a1918] group-hover:text-white transition-colors">
                      I want to shop
                    </div>
                    <div className="text-xs text-[#7a736d] group-hover:text-white/60 transition-colors mt-0.5">
                      Browse &amp; buy from stores
                    </div>
                  </div>
                </button>
              </div>
              <div className="text-center pt-2">
                <button
                  onClick={handleSignIn}
                  className="text-xs text-[#7a736d] hover:text-[#ff5c35] transition-colors font-mono font-bold"
                >
                  Already have an account? Sign in →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
