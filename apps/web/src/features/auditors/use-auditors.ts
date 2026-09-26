'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Auditor,
  AuditorListResponse,
  CreateAuditorInput,
  UpdateAuditorInput,
} from '@smartcode/types';
import { apiFetch } from '@/lib/api-client';

export interface AuditorListParams {
  page: number;
  pageSize: number;
  search?: string;
}

function buildQuery(params: AuditorListParams): string {
  const q = new URLSearchParams();
  q.set('page', String(params.page));
  q.set('pageSize', String(params.pageSize));
  if (params.search) q.set('search', params.search);
  return q.toString();
}

/** Query key is [resource, scope, filters] - same convention as use-team-leads.ts. */
export function useAuditors(params: AuditorListParams) {
  return useQuery({
    queryKey: ['auditors', 'list', params],
    queryFn: () => apiFetch<AuditorListResponse>(`/manager/auditors?${buildQuery(params)}`),
    placeholderData: (prev) => prev,
  });
}

function useInvalidateAuditors() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['auditors'] });
}

export function useCreateAuditor() {
  const invalidate = useInvalidateAuditors();
  return useMutation({
    mutationFn: (input: CreateAuditorInput) =>
      apiFetch<Auditor>('/manager/auditors', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateAuditor() {
  const invalidate = useInvalidateAuditors();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAuditorInput }) =>
      apiFetch<Auditor>(`/manager/auditors/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(),
  });
}

/** Uses the existing generic activate/deactivate endpoints - no Auditor-specific duplicates. */
export function useSetAuditorActive() {
  const invalidate = useInvalidateAuditors();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch<Auditor>(`/users/${id}/${isActive ? 'activate' : 'deactivate'}`, {
        method: 'PATCH',
      }),
    onSuccess: () => invalidate(),
  });
}
