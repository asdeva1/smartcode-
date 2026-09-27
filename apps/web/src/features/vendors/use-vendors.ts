'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssignableUser,
  CreateVendorAccountInput,
  CreateVendorInput,
  DashboardSummary,
  UpdateVendorInput,
  Vendor,
  VendorActivityResponse,
  VendorDetail,
  VendorListResponse,
  VendorOverviewRow,
  VendorStructure,
} from '@smartcode/types';
import { apiFetch, toQuery } from '@/lib/api-client';
import { todayLocal } from '@/lib/format';

export interface VendorOption {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface VendorListParams {
  page: number;
  pageSize: number;
  search?: string;
  status: 'all' | 'active' | 'inactive';
}

// ─── Manager ─────────────────────────────────────────────────

export function useVendorOptions(enabled = true) {
  return useQuery({
    queryKey: ['vendors', 'options'],
    queryFn: () => apiFetch<VendorOption[]>('/vendors/options'),
    staleTime: 60_000,
    enabled,
  });
}

export function useVendors(params: VendorListParams) {
  return useQuery({
    queryKey: ['vendors', 'list', params],
    queryFn: () => apiFetch<VendorListResponse>(`/vendors?${toQuery({ ...params })}`),
    placeholderData: (prev) => prev,
  });
}

export function useVendorOverview() {
  return useQuery({ queryKey: ['vendors', 'overview'], queryFn: () => apiFetch<VendorOverviewRow[]>('/vendors/overview') });
}

export function useVendor(id: string) {
  return useQuery({ queryKey: ['vendors', 'detail', id], queryFn: () => apiFetch<VendorDetail>(`/vendors/${id}`) });
}

export function useVendorStructure(id: string | null) {
  return useQuery({
    queryKey: ['vendors', 'structure', id ?? 'mine'],
    queryFn: () => apiFetch<VendorStructure>(id ? `/vendors/${id}/structure` : '/vendor/structure'),
  });
}

export function useVendorActivity(id: string, page: number) {
  return useQuery({
    queryKey: ['vendors', 'activity', id, page],
    queryFn: () => apiFetch<VendorActivityResponse>(`/vendors/${id}/activity?${toQuery({ page, pageSize: 25 })}`),
    placeholderData: (prev) => prev,
  });
}

/** One vendor's dashboard: the Manager's view of any vendor (id) or a Vendor's own (no id). */
export function useVendorDashboard(id: string | null) {
  const today = todayLocal();
  return useQuery({
    queryKey: ['dashboard', 'vendor', id ?? 'mine', today],
    queryFn: () => apiFetch<DashboardSummary>(id ? `/vendors/${id}/dashboard?today=${today}` : `/vendor/dashboard?today=${today}`),
  });
}

export function useAssignable(vendorId: string, role: 'TEAM_LEAD' | 'AUDITOR', enabled: boolean) {
  return useQuery({
    queryKey: ['vendors', 'assignable', vendorId, role],
    queryFn: () => apiFetch<AssignableUser[]>(`/vendors/${vendorId}/assignable?role=${role}`),
    enabled,
  });
}

export function useInvalidateVendors() {
  const qc = useQueryClient();
  return () => {
    for (const key of ['vendors', 'team-leads', 'auditors', 'dashboard']) qc.invalidateQueries({ queryKey: [key] });
  };
}

export function useCreateVendor() {
  const invalidate = useInvalidateVendors();
  return useMutation({
    mutationFn: (input: CreateVendorInput) => apiFetch<Vendor>('/vendors', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateVendor() {
  const invalidate = useInvalidateVendors();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateVendorInput }) =>
      apiFetch<Vendor>(`/vendors/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(),
  });
}

export function useSetVendorActive() {
  const invalidate = useInvalidateVendors();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch<Vendor>(`/vendors/${id}/${isActive ? 'activate' : 'deactivate'}`, { method: 'PATCH' }),
    onSuccess: () => invalidate(),
  });
}

const MEMBER_PATH = { TEAM_LEAD: 'team-leads', AUDITOR: 'auditors' } as const;

export function useAssignMember() {
  const invalidate = useInvalidateVendors();
  return useMutation({
    mutationFn: ({ vendorId, role, userId }: { vendorId: string; role: 'TEAM_LEAD' | 'AUDITOR'; userId: string }) =>
      apiFetch(`/vendors/${vendorId}/${MEMBER_PATH[role]}`, { method: 'POST', body: JSON.stringify({ userId }) }),
    onSuccess: () => invalidate(),
  });
}

export function useRemoveMember() {
  const invalidate = useInvalidateVendors();
  return useMutation({
    mutationFn: ({ vendorId, role, userId }: { vendorId: string; role: 'TEAM_LEAD' | 'AUDITOR'; userId: string }) =>
      apiFetch(`/vendors/${vendorId}/${MEMBER_PATH[role]}/${userId}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(),
  });
}

export function useCreateVendorAccount() {
  const invalidate = useInvalidateVendors();
  return useMutation({
    mutationFn: ({ vendorId, input }: { vendorId: string; input: CreateVendorAccountInput }) =>
      apiFetch(`/vendors/${vendorId}/accounts`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(),
  });
}

export function useSetAccountActive() {
  const invalidate = useInvalidateVendors();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch(`/users/${id}/${isActive ? 'activate' : 'deactivate'}`, { method: 'PATCH' }),
    onSuccess: () => invalidate(),
  });
}

// ─── Vendor's own portal ─────────────────────────────────────

export function useMyVendor() {
  return useQuery({ queryKey: ['vendors', 'me'], queryFn: () => apiFetch<VendorDetail>('/vendor/me') });
}
