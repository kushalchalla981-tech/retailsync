import { useUser } from '@clerk/react';

/** The single platform owner (see AGENTS.md). */
export const OWNER_EMAIL = 'kushalchalla981@gmail.com';

export type Role = 'guest' | 'visitor' | 'creator' | 'owner';

/**
 * owner   - OWNER_EMAIL: platform dashboard
 * creator - Clerk publicMetadata.role === 'creator' (only settable server-side / by the owner in Clerk)
 * visitor - any other signed-in user
 */
export function useRole(): { role: Role; email: string; isLoaded: boolean } {
  const { isLoaded, isSignedIn, user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? '';
  if (!isSignedIn) return { role: 'guest', email, isLoaded };
  if (email === OWNER_EMAIL) return { role: 'owner', email, isLoaded };
  if (user?.publicMetadata?.role === 'creator') return { role: 'creator', email, isLoaded };
  return { role: 'visitor', email, isLoaded };
}
