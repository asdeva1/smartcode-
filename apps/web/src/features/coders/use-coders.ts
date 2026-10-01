'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Coder, CoderDetail, CoderListResponse, CreateCoderInput, UpdateCoderInput } from '@smartcode/types';
import { apiFetch, toQuery } from '@/lib/api-client';

export interface CoderListParams {
  page: number;
  pageSize: number;
  search?: string;
  status: 'all' | 'active' | 'inactive';
}

/** Default base path (Team Lead). The Vendor Portal reuses every hook here with basePath="/vendor/coders" - both are scoped server-side from the caller's session, never a client-supplied team/vendor id. */
const DEFAULT_BASE = '/team-leads/coders';

/** Own-scope Coders (own team for a Team Lead, own vendor for a Vendor). The backend derives the scope from the session. */
export function useCoders(params: CoderListParams, basePath: string = DEFAULT_BASE) {
  return useQuery({
    queryKey: ['coders', basePath, params],
    queryFn: () => apiFetch<CoderListResponse>(`${basePath}?${toQuery({ ...params })}`),
    placeholderData: (prev) => prev,
  });
}

export function useCoder(id: string | null, basePath: string = DEFAULT_BASE) {
  return useQuery({
    queryKey: ['coders', basePath, 'detail', id],
    queryFn: () => apiFetch<CoderDetail>(`${basePath}/${id}`),
    enabled: !!id,
  });
}

function useInvalidateCoders() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['coders'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    // Organization Assignment + Auto-Visibility requirement section 10 -
    // a Team/Project assignment change must invalidate/refetch the
    // affected dashboards/directory via the existing React Query
    // architecture, never require a manual reload.
    queryClient.invalidateQueries({ queryKey: ['org-context'] });
    queryClient.invalidateQueries({ queryKey: ['employees'] });
  };
}

export function useCreateCoder(basePath: string = DEFAULT_BASE) {
  const invalidate = useInvalidateCoders();
  return useMutation({
    mutationFn: (input: CreateCoderInput) =>
      apiFetch<Coder>(basePath, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateCoder(basePath: string = DEFAULT_BASE) {
  const invalidate = useInvalidateCoders();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCoderInput }) =>
      apiFetch<Coder>(`${basePath}/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(),
  });
}

/** Existing generic endpoint - the backend allows a Team Lead only for Coders on their own team. */
export function useSetCoderActive() {
  const invalidate = useInvalidateCoders();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch<Coder>(`/users/${id}/${isActive ? 'activate' : 'deactivate'}`, { method: 'PATCH' }),
    onSuccess: () => invalidate(),
  });
}

export function useInvalidateCodersAfterImport() {
  return useInvalidateCoders();
}

/**
 * "Relieve from Team" / "Release from Team" - Organization Assignment +
 * Auto-Visibility requirement section 1. Team-Lead-only server-side
 * (CodersService.relieveFromTeam); basePath has no default here (unlike
 * every other hook above) because this action is deliberately NOT
 * exposed on the Vendor Portal's Coders screen - see CodersManager's
 * `allowRelieveFromTeam` prop.
 */
export function useRelieveCoderFromTeam(basePath: string) {
  const invalidate = useInvalidateCoders();
  return useMutation({
    mutationFn: (id: string) => apiFetch<Coder>(`${basePath}/${id}/relieve`, { method: 'POST' }),
    onSuccess: () => invalidate(),
  });
}
