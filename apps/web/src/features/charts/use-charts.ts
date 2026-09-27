'use client';
import { useQuery } from '@tanstack/react-query';
import type { ChartDetail, ChartListResponse } from '@smartcode/types';
import { apiFetch, toQuery } from '@/lib/api-client';

export interface ChartListParams {
  page: number;
  pageSize: number;
  search?: string;
  productionStatus?: string;
  auditState?: string;
  rework?: 'yes';
}

export function useCharts(params: ChartListParams) {
  return useQuery({
    queryKey: ['charts', 'list', params],
    queryFn: () => apiFetch<ChartListResponse>(`/charts?${toQuery({ ...params })}`),
    placeholderData: (prev) => prev,
  });
}

export function useChartDetail(chartId: string | null) {
  return useQuery({
    queryKey: ['charts', 'detail', chartId],
    queryFn: () => apiFetch<ChartDetail>(`/charts/${encodeURIComponent(chartId!)}`),
    enabled: !!chartId,
  });
}
