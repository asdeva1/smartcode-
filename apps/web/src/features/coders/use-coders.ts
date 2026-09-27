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

/** Team Lead's own-team Coders. The backend scopes to the caller's team from the session. */
export function useCoders(params: CoderListParams) {
  return useQuery({
    queryKey: ['coders', 'team', params],
    queryFn: () => apiFetch<CoderListResponse>(`/team-leads/coders?${toQuery({ ...params })}`),
    placeholderData: (prev) => prev,
  });
}

export function useCoder(id: string | null) {
  return useQuery({
    queryKey: ['coders', 'detail', id],
    queryFn: () => apiFetch<CoderDetail>(`/team-leads/coders/${id}`),
    enabled: !!id,
  });
}

function useInvalidateCoders() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['coders'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useCreateCoder() {
  const invalidate = useInvalidateCoders();
  return useMutation({
    mutationFn: (input: CreateCoderInput) =>
      apiFetch<Coder>('/team-leads/coders', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateCoder() {
  const invalidate = useInvalidateCoders();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCoderInput }) =>
      apiFetch<Coder>(`/team-leads/coders/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
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
