'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApprovalListResponse, ApprovalRequest } from '@smartcode/types';
import { apiFetch, toQuery } from '@/lib/api-client';

export interface ApprovalListParams {
  page: number;
  pageSize: number;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'all';
  type?: string;
}

/** Universal Approval Engine (docs/09-BUSINESS-RULES.md section 9) - Manager's queue. */
export function useApprovals(params: ApprovalListParams) {
  return useQuery({
    queryKey: ['approvals', 'list', params],
    queryFn: () => apiFetch<ApprovalListResponse>(`/manager/approvals?${toQuery({ ...params })}`),
    placeholderData: (prev) => prev,
  });
}

function useInvalidateApprovals() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['approvals'] });
}

export function useApproveRequest() {
  const invalidate = useInvalidateApprovals();
  return useMutation({
    mutationFn: (id: string) => apiFetch<ApprovalRequest>(`/manager/approvals/${id}/approve`, { method: 'PATCH' }),
    onSuccess: () => invalidate(),
  });
}

export function useRejectRequest() {
  const invalidate = useInvalidateApprovals();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<ApprovalRequest>(`/manager/approvals/${id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => invalidate(),
  });
}
