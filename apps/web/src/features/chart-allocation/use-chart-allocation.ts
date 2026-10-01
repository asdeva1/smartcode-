'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChartAllocationCommitResponse,
  ChartAllocationHistoryListResponse,
  ChartAllocationImportHistoryRow,
  ChartAllocationListResponse,
  ChartAllocationMetrics,
  ChartAllocationPreviewResponse,
  PullbackChartAllocationInput,
  ReassignChartAllocationInput,
} from '@smartcode/types';

interface ChartAllocationImportHistoryListResponse {
  data: ChartAllocationImportHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
}
import { apiDownload, apiFetch, apiUpload, toQuery } from '@/lib/api-client';

/**
 * Phase 10D — Chart Allocation (docs/09-BUSINESS-RULES.md section 12).
 * A separate feature/hook module from features/charts (ChartRepository) -
 * it does not replace or modify that feature, only adds a new workspace
 * alongside it.
 */

export interface ChartAllocationListParams {
  page: number;
  pageSize: number;
  search?: string;
  allocated?: 'all' | 'allocated' | 'unallocated';
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ['chart-allocations', 'charts', 'production', 'dashboard']) qc.invalidateQueries({ queryKey: [key] });
}

/** Manager: browse/filter a MANUAL project's charts for allocation. */
export function useChartAllocationList(projectId: string | null, params: ChartAllocationListParams) {
  return useQuery({
    queryKey: ['chart-allocations', 'list', projectId, params],
    queryFn: () => apiFetch<ChartAllocationListResponse>(`/projects/${projectId}/chart-allocations?${toQuery({ ...params })}`),
    enabled: !!projectId,
    placeholderData: (prev) => prev,
  });
}

/** Manager: download the Summary export (blank "Assigned to", fixed "Shift 1"). */
export function useExportChartAllocationSummary() {
  return useMutation({
    mutationFn: ({ projectId, format, search, allocated }: { projectId: string; format: 'csv' | 'xlsx'; search?: string; allocated?: string }) =>
      apiDownload(`/projects/${projectId}/chart-allocations/export?${toQuery({ format, search, allocated })}`),
  });
}

/** Team Lead: validate a filled-in Summary re-upload without writing anything. */
export function usePreviewChartAllocationUpload() {
  return useMutation({
    mutationFn: ({ projectId, file }: { projectId: string; file: File }) =>
      apiUpload<ChartAllocationPreviewResponse>(`/projects/${projectId}/chart-allocations/preview`, file),
  });
}

/** Team Lead: commit a filled-in Summary re-upload - all-or-nothing. */
export function useCommitChartAllocationUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, file }: { projectId: string; file: File }) =>
      apiUpload<ChartAllocationCommitResponse>(`/projects/${projectId}/chart-allocations`, file),
    onSuccess: () => invalidate(qc),
  });
}

export function useChartAllocationHistory(projectId: string | null, params: { page: number; pageSize: number; search?: string }) {
  return useQuery({
    queryKey: ['chart-allocations', 'history', projectId, params],
    queryFn: () => apiFetch<ChartAllocationHistoryListResponse>(`/projects/${projectId}/chart-allocations/history?${toQuery({ ...params })}`),
    enabled: !!projectId,
    placeholderData: (prev) => prev,
  });
}

export function useChartAllocationImportHistory(projectId: string | null, params: { page: number; pageSize: number; search?: string }) {
  return useQuery({
    queryKey: ['chart-allocations', 'import-history', projectId, params],
    queryFn: () => apiFetch<ChartAllocationImportHistoryListResponse>(`/projects/${projectId}/chart-allocations/import-history?${toQuery({ ...params })}`),
    enabled: !!projectId,
    placeholderData: (prev) => prev,
  });
}

export function useChartAllocationMetrics(projectId: string | null) {
  return useQuery({
    queryKey: ['chart-allocations', 'metrics', projectId],
    queryFn: () => apiFetch<ChartAllocationMetrics>(`/projects/${projectId}/chart-allocations/metrics`),
    enabled: !!projectId,
  });
}

export function usePullbackChartAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, chartId, input }: { projectId: string; chartId: string; input: PullbackChartAllocationInput }) =>
      apiFetch(`/projects/${projectId}/chart-allocations/${encodeURIComponent(chartId)}/pullback`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(qc),
  });
}

export function useReassignChartAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, chartId, input }: { projectId: string; chartId: string; input: ReassignChartAllocationInput }) =>
      apiFetch(`/projects/${projectId}/chart-allocations/${encodeURIComponent(chartId)}/reassign`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(qc),
  });
}
