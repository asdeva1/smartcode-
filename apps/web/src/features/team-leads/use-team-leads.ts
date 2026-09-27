'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateTeamLeadInput,
  UpdateTeamLeadInput,
  TeamLeadListResponse,
  TeamLead,
} from '@smartcode/types';
import { apiFetch } from '@/lib/api-client';

export interface TeamLeadListParams {
  page: number;
  pageSize: number;
  search?: string;
  status: 'all' | 'active' | 'inactive';
  teamId?: string;
  vendorId?: string;
}

function buildQuery(params: TeamLeadListParams): string {
  const q = new URLSearchParams();
  q.set('page', String(params.page));
  q.set('pageSize', String(params.pageSize));
  q.set('status', params.status);
  if (params.search) q.set('search', params.search);
  if (params.teamId) q.set('teamId', params.teamId);
  if (params.vendorId) q.set('vendorId', params.vendorId);
  return q.toString();
}

/**
 * Query key is [resource, scope, filters] - see
 * docs/05-FRONTEND-ARCHITECTURE.md "State Strategy" - so an invalidation
 * after create/update/activate targets exactly the right cached lists.
 */
export function useTeamLeads(params: TeamLeadListParams) {
  return useQuery({
    queryKey: ['team-leads', 'list', params],
    queryFn: () => apiFetch<TeamLeadListResponse>(`/manager/team-leads?${buildQuery(params)}`),
    placeholderData: (prev) => prev,
  });
}

function useInvalidateTeamLeads() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['team-leads'] });
}

export function useCreateTeamLead() {
  const invalidate = useInvalidateTeamLeads();
  return useMutation({
    mutationFn: (input: CreateTeamLeadInput) =>
      apiFetch<TeamLead>('/manager/team-leads', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateTeamLead() {
  const invalidate = useInvalidateTeamLeads();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTeamLeadInput }) =>
      apiFetch<TeamLead>(`/manager/team-leads/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(),
  });
}

export function useSetTeamLeadActive() {
  const invalidate = useInvalidateTeamLeads();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch<TeamLead>(`/users/${id}/${isActive ? 'activate' : 'deactivate'}`, {
        method: 'PATCH',
      }),
    onSuccess: () => invalidate(),
  });
}
