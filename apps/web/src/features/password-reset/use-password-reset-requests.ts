'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PasswordResetApproveResponse, PasswordResetRequestListResponse, PasswordResetRequestRow } from '@smartcode/types';
import { apiFetch, toQuery } from '@/lib/api-client';

export interface PasswordResetRequestListParams {
  page: number;
  pageSize: number;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'all';
}

/**
 * Manager's queue for the password-reset request/approval/link workflow
 * (docs/09-BUSINESS-RULES.md section 8, Phase 8) - mirrors
 * features/approvals/use-approvals.ts's shape for the Universal Approval
 * Engine, but against this workflow's own dedicated endpoints, since a
 * reset request/token has its own lifecycle (expiry/used/revoked) that
 * the generic approval payload doesn't model.
 */
export function usePasswordResetRequests(params: PasswordResetRequestListParams) {
  return useQuery({
    queryKey: ['password-reset-requests', 'list', params],
    queryFn: () => apiFetch<PasswordResetRequestListResponse>(`/manager/password-reset-requests?${toQuery({ ...params })}`),
    placeholderData: (prev) => prev,
  });
}

function useInvalidatePasswordResetRequests() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['password-reset-requests'] });
}

export function useApprovePasswordResetRequest() {
  const invalidate = useInvalidatePasswordResetRequests();
  return useMutation({
    mutationFn: (id: string) => apiFetch<PasswordResetApproveResponse>(`/manager/password-reset-requests/${id}/approve`, { method: 'PATCH' }),
    onSuccess: () => invalidate(),
  });
}

export function useRejectPasswordResetRequest() {
  const invalidate = useInvalidatePasswordResetRequests();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<PasswordResetRequestRow>(`/manager/password-reset-requests/${id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => invalidate(),
  });
}
