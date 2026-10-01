'use client';
import { useQuery } from '@tanstack/react-query';
import type { OrgContext } from '@smartcode/types';
import { apiFetch } from '@/lib/api-client';

/**
 * "Organization Assignment + Auto-Visibility" requirement - fetches the
 * caller's current authorized organizational context from the backend
 * (the single source of truth). Every role's dashboard consumes this
 * instead of asking the user to re-select an already-assigned Team or
 * Project.
 */
export function useOrgContext() {
  return useQuery({
    queryKey: ['org-context', 'me'],
    queryFn: () => apiFetch<OrgContext>('/me/context'),
    staleTime: 60_000,
  });
}
