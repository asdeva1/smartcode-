import { create } from 'zustand';
import type { AuthUser } from '@smartcode/types';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  setSession: (user: AuthUser, accessToken: string) => void;
  clear: () => void;
}

/**
 * Deliberately NOT persisted to localStorage/sessionStorage - see
 * docs/07-SECURITY-ARCHITECTURE.md. Access token and user identity
 * live only in memory for the tab's lifetime; a page refresh relies
 * on POST /api/auth/refresh (via the httpOnly cookie) to re-establish
 * the session, handled by useCurrentUser on mount.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  setSession: (user, accessToken) => set({ user, accessToken }),
  clear: () => set({ user: null, accessToken: null }),
}));
