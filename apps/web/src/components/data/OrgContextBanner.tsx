'use client';
import * as React from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { Building2, Users, UserCog, FolderKanban } from 'lucide-react';
import type { OrgContext } from '@smartcode/types';
import { useOrgContext } from '@/features/org-context/use-org-context';

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      {icon}
      <Typography variant="body2" color="text.secondary">
        {label}:
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        {value}
      </Typography>
    </Stack>
  );
}

/**
 * "Organization Assignment + Auto-Visibility" requirement sections 4/5/6/7
 * - shows the caller's current organizational context (Vendor/Team/Team
 * Lead/Project(s)/Client), automatically fetched from the backend
 * (`GET /me/context`) and never manually entered or hardcoded. Rendered
 * on every non-Manager dashboard - a Manager's scope is enterprise-wide,
 * so it renders nothing for that role.
 */
export function OrgContextBanner() {
  const { data, isLoading } = useOrgContext();
  if (isLoading || !data || data.role === 'MANAGER') return null;
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      {renderByRole(data)}
    </Paper>
  );
}

function renderByRole(ctx: OrgContext) {
  const projectNames = (projects: { name: string }[]) => (projects.length ? projects.map((p) => p.name).join(', ') : '—');

  if (ctx.role === 'CODER') {
    return (
      <Stack direction="row" spacing={3} flexWrap="wrap" rowGap={1}>
        <Field icon={<Building2 size={16} />} label="Vendor" value={ctx.vendor?.name ?? '—'} />
        <Field icon={<Users size={16} />} label="Team" value={ctx.team?.name ?? 'Not yet assigned'} />
        <Field icon={<UserCog size={16} />} label="Team Lead" value={ctx.teamLead?.fullName ?? ctx.teamLead?.loginName ?? '—'} />
        <Field icon={<FolderKanban size={16} />} label={ctx.projects.length > 1 ? 'Assigned Projects' : 'Assigned Project'} value={projectNames(ctx.projects)} />
      </Stack>
    );
  }
  if (ctx.role === 'TEAM_LEAD') {
    return (
      <Stack direction="row" spacing={3} flexWrap="wrap" rowGap={1}>
        <Field icon={<Building2 size={16} />} label="Vendor" value={ctx.vendor?.name ?? '—'} />
        <Field icon={<Users size={16} />} label="Team" value={ctx.teams[0]?.name ?? 'Not yet assigned'} />
        <Field icon={<FolderKanban size={16} />} label="Assigned Project(s)" value={projectNames(ctx.projects)} />
        <Chip size="small" label={`${ctx.coderCount} Coder${ctx.coderCount === 1 ? '' : 's'}`} />
      </Stack>
    );
  }
  if (ctx.role === 'AUDITOR') {
    return (
      <Stack direction="row" spacing={3} flexWrap="wrap" rowGap={1}>
        <Field icon={<Building2 size={16} />} label="Vendor" value={ctx.vendor?.name ?? 'Enterprise (no vendor)'} />
        <Field icon={<FolderKanban size={16} />} label="Assigned Project(s)" value={projectNames(ctx.projects)} />
        <Field icon={<Building2 size={16} />} label="Client(s)" value={ctx.clients.length ? ctx.clients.map((c) => c.name).join(', ') : '—'} />
      </Stack>
    );
  }
  if (ctx.role !== 'VENDOR') return null;
  return (
    <Stack direction="row" spacing={3} flexWrap="wrap" rowGap={1}>
      <Field icon={<Building2 size={16} />} label="Vendor" value={ctx.vendor?.name ?? '—'} />
      <Field icon={<Users size={16} />} label="Teams" value={ctx.teams.length} />
      <Field icon={<UserCog size={16} />} label="Team Leads" value={ctx.teamLeads.length} />
      <Field icon={<FolderKanban size={16} />} label="Projects" value={ctx.projects.length} />
      <Chip size="small" label={`${ctx.coderCount} Coder${ctx.coderCount === 1 ? '' : 's'}`} />
      <Chip size="small" label={`${ctx.activeUsers} active user${ctx.activeUsers === 1 ? '' : 's'}`} />
    </Stack>
  );
}
