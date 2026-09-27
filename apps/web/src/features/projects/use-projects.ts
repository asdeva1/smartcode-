'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuditorAssignment,
  AuditorListResponse,
  Client,
  CreateAuditorAssignmentInput,
  CreateClientInput,
  CreateProjectInput,
  Project,
  TeamLeadListResponse,
  UpdateProjectInput,
} from '@smartcode/types';
import { apiFetch } from '@/lib/api-client';

export const useClients = () => useQuery({ queryKey: ['clients'], queryFn: () => apiFetch<Client[]>('/manager/clients') });
export const useProjects = () => useQuery({ queryKey: ['projects', 'all'], queryFn: () => apiFetch<Project[]>('/manager/projects') });
export const useAssignments = () =>
  useQuery({ queryKey: ['auditor-assignments'], queryFn: () => apiFetch<AuditorAssignment[]>('/manager/auditor-assignments') });

/** Existing Manager list endpoints, used for pickers (max page size). */
export const useActiveAuditors = () =>
  useQuery({ queryKey: ['auditors', 'picker'], queryFn: () => apiFetch<AuditorListResponse>('/manager/auditors?page=1&pageSize=100') });
export const useTeamLeadPicker = () =>
  useQuery({ queryKey: ['team-leads', 'picker'], queryFn: () => apiFetch<TeamLeadListResponse>('/manager/team-leads?page=1&pageSize=100&status=active') });

function useInvalidate(keys: string[][]) {
  const qc = useQueryClient();
  return () => keys.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
}

export function useCreateClient() {
  const invalidate = useInvalidate([['clients']]);
  return useMutation({
    mutationFn: (input: CreateClientInput) => apiFetch<Client>('/manager/clients', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(),
  });
}

export function useCreateProject() {
  const invalidate = useInvalidate([['projects']]);
  return useMutation({
    mutationFn: (input: CreateProjectInput) => apiFetch<Project>('/manager/projects', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateProject() {
  const invalidate = useInvalidate([['projects']]);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProjectInput }) =>
      apiFetch<Project>(`/manager/projects/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(),
  });
}

export function useCreateAssignment() {
  const invalidate = useInvalidate([['auditor-assignments'], ['projects']]);
  return useMutation({
    mutationFn: (input: CreateAuditorAssignmentInput) =>
      apiFetch<AuditorAssignment>('/manager/auditor-assignments', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteAssignment() {
  const invalidate = useInvalidate([['auditor-assignments'], ['projects']]);
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ id: string }>(`/manager/auditor-assignments/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(),
  });
}

export function useCreateTeam() {
  const invalidate = useInvalidate([['teams'], ['team-leads']]);
  return useMutation({
    mutationFn: (input: { name: string; teamLeadId?: string }) => apiFetch('/teams', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidate(),
  });
}
