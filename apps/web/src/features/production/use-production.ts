'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateProductionInput, ProductionEntry, ProductionListResponse, UpdateProductionInput } from '@smartcode/types';
import { apiFetch, toQuery } from '@/lib/api-client';

export interface ProductionListParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  from?: string;
  to?: string;
}

export interface ProjectOption {
  id: string;
  name: string;
  client: { id: string; name: string } | null;
}

export function useProductionList(params: ProductionListParams) {
  return useQuery({
    queryKey: ['production', 'list', params],
    queryFn: () => apiFetch<ProductionListResponse>(`/production?${toQuery({ ...params })}`),
    placeholderData: (prev) => prev,
  });
}

/** Projects the caller works in (Coder: own team's active projects). */
export function useMyProjects() {
  return useQuery({ queryKey: ['projects', 'mine'], queryFn: () => apiFetch<ProjectOption[]>('/projects/mine') });
}

function useInvalidateProduction() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ['production', 'charts', 'dashboard', 'reports']) queryClient.invalidateQueries({ queryKey: [key] });
  };
}

export function useCreateProduction() {
  const invalidate = useInvalidateProduction();
  return useMutation({
    mutationFn: (input: CreateProductionInput) =>
      apiFetch<ProductionEntry>('/production', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateProduction() {
  const invalidate = useInvalidateProduction();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductionInput }) =>
      apiFetch<ProductionEntry>(`/production/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(),
  });
}

export function useProductionAction() {
  const invalidate = useInvalidateProduction();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'rework' | 'cancel' }) =>
      apiFetch<ProductionEntry>(`/production/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => invalidate(),
  });
}
