import { useUser } from '@clerk/react';
import { storeManager } from '../data/storeManager';

/** The single platform owner (see AGENTS.md). */
export const OWNER_EMAIL = 'kushalchalla981@gmail.com';

export type Role = 'guest' | 'visitor' | 'creator' | 'owner';

/**
 * owner   - OWNER_EMAIL: full platform dashboard (all stores + telemetry)
 * creator - user who owns at least one created store or has creator role
 * visitor - any other signed-in user
 */
export function useRole(): { role: Role; email: string; isLoaded: boolean; hasStore: boolean } {
  const { isLoaded, isSignedIn, user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? '';
  if (!isSignedIn) return { role: 'guest', email, isLoaded, hasStore: false };
  if (email === OWNER_EMAIL) return { role: 'owner', email, isLoaded, hasStore: true };
  const hasStore = storeManager.userOwnsStores({ id: user?.id ?? '', email });
  if (hasStore || user?.publicMetadata?.role === 'creator') {
    return { role: 'creator', email, isLoaded, hasStore: true };
  }
  return { role: 'visitor', email, isLoaded, hasStore: false };
}
