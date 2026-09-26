'use client';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface TeamOption {
  id: string;
  name: string;
  teamLead: { id: string; employeeId: string; loginName: string } | null;
}

/** Reuses the existing GET /teams endpoint (apps/api teams.controller.ts) - no new backend surface needed for the dropdown. */
export function useTeams() {
  return useQuery({
    queryKey: ['teams', 'list'],
    queryFn: () => apiFetch<TeamOption[]>('/teams'),
    staleTime: 60_000,
  });
}
