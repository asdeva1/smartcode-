'use client';
import { useQuery } from '@tanstack/react-query';
import type { EmployeeDetail, EmployeeListResponse } from '@smartcode/types';
import { apiFetch, toQuery } from '@/lib/api-client';

export interface EmployeeListParams {
  page: number;
  pageSize: number;
  search?: string;
  role?: string;
  status?: 'active' | 'inactive' | 'all';
  vendorId?: string;
  teamId?: string;
  teamLeadId?: string;
}

/** Manager's Employee Directory search (docs/09-BUSINESS-RULES.md section 11, Phase 9). Server-side search/filter/pagination - never loads everything into the browser. */
export function useEmployees(params: EmployeeListParams) {
  return useQuery({
    queryKey: ['employees', 'list', params],
    queryFn: () => apiFetch<EmployeeListResponse>(`/manager/employees?${toQuery({ ...params })}`),
    placeholderData: (prev) => prev,
  });
}

/** One employee's full detail - Identity/Account/Organization plus Login Name allocation history - the detail drawer's single data source. */
export function useEmployeeDetail(id: string | null) {
  return useQuery({
    queryKey: ['employees', 'detail', id],
    queryFn: () => apiFetch<EmployeeDetail>(`/manager/employees/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
}
