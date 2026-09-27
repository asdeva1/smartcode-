'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuditEntry,
  AuditListResponse,
  AuditQueueResponse,
  ChartProductionLookup,
  CreateAuditInput,
  ReauditInput,
  ResolveAuditInput,
  UpdateAuditInput,
} from '@smartcode/types';
import { apiFetch, toQuery } from '@/lib/api-client';

export interface AuditListParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  from?: string;
  to?: string;
}

export function useAuditList(params: AuditListParams) {
  return useQuery({
    queryKey: ['audits', 'list', params],
    queryFn: () => apiFetch<AuditListResponse>(`/audits?${toQuery({ ...params })}`),
    placeholderData: (prev) => prev,
  });
}

export interface QueueParams {
  page: number;
  pageSize: number;
  search?: string;
  projectId?: string;
  state: 'all' | 'pending' | 'in_progress';
}

export function useAuditQueue(params: QueueParams) {
  return useQuery({
    queryKey: ['audits', 'queue', params],
    queryFn: () => apiFetch<AuditQueueResponse>(`/auditor/queue?${toQuery({ ...params })}`),
    placeholderData: (prev) => prev,
  });
}

/** The Auditor's "Fetch": current production for a Chart ID, read-only. */
export function useChartLookup(chartId: string | null) {
  return useQuery({
    queryKey: ['audits', 'lookup', chartId],
    queryFn: () => apiFetch<ChartProductionLookup>(`/charts/${encodeURIComponent(chartId!)}/production`),
    enabled: !!chartId,
    retry: false,
  });
}

export function useInvalidateAudits() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ['audits', 'charts', 'dashboard', 'reports']) queryClient.invalidateQueries({ queryKey: [key] });
  };
}

/** Save / Complete / Review Required / Rework / Re-audit all go through here. totalErrors is never sent - the server computes it. */
export function useSubmitAudit() {
  const invalidate = useInvalidateAudits();
  return useMutation({
    mutationFn: (
      req:
        | { kind: 'create'; input: CreateAuditInput }
        | { kind: 'update'; id: string; input: UpdateAuditInput }
        | { kind: 'reaudit'; id: string; input: ReauditInput },
    ) =>
      req.kind === 'create'
        ? apiFetch<AuditEntry>('/audits', { method: 'POST', body: JSON.stringify(req.input) })
        : req.kind === 'update'
          ? apiFetch<AuditEntry>(`/audits/${req.id}`, { method: 'PATCH', body: JSON.stringify(req.input) })
          : apiFetch<AuditEntry>(`/audits/${req.id}/reaudit`, { method: 'POST', body: JSON.stringify(req.input) }),
    onSuccess: () => invalidate(),
  });
}

export function useResolveAudit() {
  const invalidate = useInvalidateAudits();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResolveAuditInput }) =>
      apiFetch<AuditEntry>(`/audits/${id}/resolve`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(),
  });
}
