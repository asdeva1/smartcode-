'use client';
import { useQuery } from '@tanstack/react-query';
import type { LoginNameAllocationDetail, LoginNameAllocationListResponse } from '@smartcode/types';
import { apiFetch, toQuery } from '@/lib/api-client';

export interface LoginNameAllocationListParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: 'ACTIVE' | 'DEACTIVATED' | 'REALLOCATED' | 'all';
  role?: string;
  vendorId?: string;
  teamId?: string;
}

/** Manager's Login Name Details search (docs/09-BUSINESS-RULES.md section 10, Phase 9). Defaults to the live ACTIVE directory. */
export function useLoginNameAllocations(params: LoginNameAllocationListParams) {
  return useQuery({
    queryKey: ['login-name-allocations', 'list', params],
    queryFn: () => apiFetch<LoginNameAllocationListResponse>(`/manager/login-name-allocations?${toQuery({ ...params })}`),
    placeholderData: (prev) => prev,
  });
}

/** Current allocation + complete history for one exact Login Name - the detail drawer's single data source. */
export function useLoginNameAllocationDetail(loginName: string | null) {
  return useQuery({
    queryKey: ['login-name-allocations', 'detail', loginName],
    queryFn: () => apiFetch<LoginNameAllocationDetail>(`/manager/login-name-allocations/${encodeURIComponent(loginName!)}`),
    enabled: !!loginName,
  });
}
