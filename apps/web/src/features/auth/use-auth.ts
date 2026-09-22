'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser, LoginInput } from '@smartcode/types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

interface LoginResponse {
  user: AuthUser;
  accessToken: string;
}

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (input: LoginInput) =>
      apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => setSession(data.user, data.accessToken),
  });
}

/**
 * Re-establishes the session on load (e.g. after a page refresh) by
 * attempting a silent refresh, then fetching /auth/me. See
 * docs/05-FRONTEND-ARCHITECTURE.md - this is the client-side half of
 * route protection; the backend independently re-checks on every
 * request regardless of what this hook believes.
 */
export function useCurrentUser() {
  const { user, accessToken, setSession, clear } = useAuthStore();

  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      if (!accessToken) {
        const refreshed = await apiFetch<{ accessToken: string }>('/auth/refresh', { method: 'POST' });
        useAuthStore.setState({ accessToken: refreshed.accessToken });
      }
      const me = await apiFetch<AuthUser>('/auth/me');
      setSession(me, useAuthStore.getState().accessToken!);
      return me;
    },
    retry: false,
    enabled: !user,
    staleTime: 5 * 60_000,
  });

  return {
    user: user ?? query.data ?? null,
    isLoading: !user && query.isLoading,
    isError: query.isError,
    clear,
  };
}

export function useLogout() {
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      clear();
      queryClient.clear();
    },
  });
}

export type { ApiError };
