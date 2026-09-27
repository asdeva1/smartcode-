'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Rework, ReworkListResponse, ReworkSummary, ResolveReworkInput } from '@smartcode/types';
import { apiFetch, toQuery } from '@/lib/api-client';

export interface ReworkListParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  vendorId?: string;
}

/** Read-only: refreshing a dashboard never creates notifications (they are written only by the rework event itself). */
export function useReworkSummary(vendorId?: string) {
  return useQuery({
    queryKey: ['rework', 'summary', vendorId ?? null],
    queryFn: () => apiFetch<ReworkSummary>(`/rework/summary${vendorId ? `?${toQuery({ vendorId })}` : ''}`),
  });
}

export function useReworkList(params: ReworkListParams) {
  return useQuery({
    queryKey: ['rework', 'list', params],
    queryFn: () => apiFetch<ReworkListResponse>(`/rework?${toQuery({ ...params })}`),
    placeholderData: (prev) => prev,
  });
}

function useInvalidateRework() {
  const qc = useQueryClient();
  return () => {
    for (const key of ['rework', 'notifications', 'production', 'charts', 'dashboard', 'audits']) qc.invalidateQueries({ queryKey: [key] });
  };
}

/** Opening a rework item marks the caller's own notifications for it as read. */
export function useMarkReworkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ id: string; markedRead: number }>(`/rework/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rework'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useResolveRework() {
  const invalidate = useInvalidateRework();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResolveReworkInput }) =>
      apiFetch<Rework>(`/rework/${id}/resolve`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(),
  });
}

export function useReworkItem(id: string | null) {
  return useQuery({
    queryKey: ['rework', 'item', id],
    queryFn: () => apiFetch<Rework>(`/rework/${id}`),
    enabled: !!id,
    retry: false,
  });
}
