'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CoderListResponse, ReportFilterKey, Role } from '@smartcode/types';
import { Select } from '@smartcode/ui';
import { apiFetch } from '@/lib/api-client';
import { personName } from '@/lib/format';
import { useVendorOptions, useVendorStructure } from '@/features/vendors/use-vendors';
import { useActiveAuditors, useProjects, useTeamLeadPicker } from '@/features/projects/use-projects';
import { useTeams } from '@/features/team-leads/use-teams';
import { useMyProjects } from '@/features/production/use-production';

export type ReportFilterValues = Partial<Record<ReportFilterKey, string>>;
type Option = { value: string; label: string };
interface Props {
  values: ReportFilterValues;
  onChange: (key: ReportFilterKey, value: string) => void;
}

const LABEL: Record<ReportFilterKey, { label: string; all: string }> = {
  vendorId: { label: 'Vendor', all: 'All vendors' },
  teamLeadId: { label: 'Team Lead', all: 'All Team Leads' },
  auditorId: { label: 'Auditor', all: 'All Auditors' },
  teamId: { label: 'Team', all: 'All teams' },
  projectId: { label: 'Project', all: 'All projects' },
  coderId: { label: 'Coder', all: 'All coders' },
};

function FilterSelect({ k, options, values, onChange }: Props & { k: ReportFilterKey; options: Option[] }) {
  return (
    <Select
      label={LABEL[k].label}
      value={values[k] ?? ''}
      onChange={(e) => onChange(k, e.target.value)}
      options={[{ value: '', label: LABEL[k].all }, ...options]}
      sx={{ minWidth: 170 }}
    />
  );
}

function ManagerFilters(p: Props) {
  const vendors = useVendorOptions();
  const leads = useTeamLeadPicker();
  const auditors = useActiveAuditors();
  const teams = useTeams();
  const projects = useProjects();
  return (
    <>
      <FilterSelect {...p} k="vendorId" options={(vendors.data ?? []).map((v) => ({ value: v.id, label: v.name }))} />
      <FilterSelect {...p} k="teamLeadId" options={(leads.data?.data ?? []).map((u) => ({ value: u.id, label: personName(u) }))} />
      <FilterSelect {...p} k="auditorId" options={(auditors.data?.data ?? []).map((u) => ({ value: u.id, label: personName(u) }))} />
      <FilterSelect {...p} k="teamId" options={(teams.data ?? []).map((t) => ({ value: t.id, label: t.name }))} />
      <FilterSelect {...p} k="projectId" options={(projects.data ?? []).map((x) => ({ value: x.id, label: x.name }))} />
    </>
  );
}

function TeamLeadFilters(p: Props) {
  const coders = useQuery({
    queryKey: ['coders', 'picker'],
    queryFn: () => apiFetch<CoderListResponse>('/team-leads/coders?page=1&pageSize=100'),
  });
  const projects = useMyProjects();
  return (
    <>
      <FilterSelect {...p} k="coderId" options={(coders.data?.data ?? []).map((c) => ({ value: c.id, label: personName(c) }))} />
      <FilterSelect {...p} k="projectId" options={(projects.data ?? []).map((x) => ({ value: x.id, label: x.name }))} />
    </>
  );
}

function AuditorFilters(p: Props) {
  const projects = useMyProjects();
  return <FilterSelect {...p} k="projectId" options={(projects.data ?? []).map((x) => ({ value: x.id, label: x.name }))} />;
}

function VendorFilters(p: Props) {
  const structure = useVendorStructure(null);
  const projects = useMyProjects();
  const teams = structure.data?.teams ?? [];
  return (
    <>
      <FilterSelect {...p} k="teamId" options={teams.map((t) => ({ value: t.id, label: t.name }))} />
      <FilterSelect
        {...p}
        k="teamLeadId"
        options={teams.filter((t) => t.teamLead).map((t) => ({ value: t.teamLead!.id, label: personName(t.teamLead) }))}
      />
      <FilterSelect {...p} k="auditorId" options={(structure.data?.auditors ?? []).map((a) => ({ value: a.id, label: personName(a) }))} />
      <FilterSelect {...p} k="projectId" options={(projects.data ?? []).map((x) => ({ value: x.id, label: x.name }))} />
    </>
  );
}

/**
 * The report filters a role is authorised to use (REPORT_FILTERS_BY_ROLE);
 * the API enforces the same list and AND-s each filter onto the caller's
 * scope, so options here are a convenience, never the security boundary.
 */
export function ReportFilters({ role, ...p }: Props & { role: Role }) {
  if (role === 'MANAGER') return <ManagerFilters {...p} />;
  if (role === 'TEAM_LEAD') return <TeamLeadFilters {...p} />;
  if (role === 'AUDITOR') return <AuditorFilters {...p} />;
  if (role === 'VENDOR') return <VendorFilters {...p} />;
  return null;
}
