'use client';
import * as React from 'react';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { DataTable, EmptyState, ErrorState, LoadingState } from '@smartcode/ui';
import { personName } from '@/lib/format';
import { useVendorStructure } from './use-vendors';

const active = (isActive: boolean) => <Chip size="small" label={isActive ? 'Active' : 'Inactive'} color={isActive ? 'success' : 'default'} variant={isActive ? 'filled' : 'outlined'} />;

/** Vendor -> Team Leads -> Teams -> Coders / Projects, and the vendor's Auditors. */
export function VendorStructureView({ vendorId }: { vendorId: string | null }) {
  const { data, isLoading, isError, refetch } = useVendorStructure(vendorId);
  if (isLoading) return <LoadingState label="Loading team structure..." />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} description="Could not load the team structure." />;
  return (
    <Stack spacing={2}>
      {data.teams.length === 0 && <EmptyState title="No teams yet" description="Assign a Team Lead to this vendor - their team, coders and projects appear here." />}
      {data.teams.map((t) => (
        <Paper key={t.id} variant="outlined" sx={{ p: 2 }} aria-label={`Team ${t.name}`} component="section">
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              {t.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Team Lead: <strong>{personName(t.teamLead)}</strong>
              {t.teamLead ? ` (${t.teamLead.employeeId})` : ''}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
              Projects:
            </Typography>
            {t.projects.length ? t.projects.map((p) => <Chip key={p.id} size="small" variant="outlined" label={p.isActive ? p.name : `${p.name} (inactive)`} />) : <Typography variant="caption">none</Typography>}
          </Stack>
          <DataTable
            rows={t.coders}
            rowKey={(c) => c.id}
            emptyTitle="No coders in this team"
            columns={[
              { key: 'name', header: 'Coder', render: (c) => personName(c) },
              { key: 'employeeId', header: 'Employee ID', render: (c) => c.employeeId },
              { key: 'loginName', header: 'Login Name', render: (c) => c.loginName },
              { key: 'status', header: 'Status', render: (c) => active(c.isActive) },
            ]}
          />
        </Paper>
      ))}
      <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="Auditors">
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
          Auditors
        </Typography>
        <DataTable
          rows={data.auditors}
          rowKey={(a) => a.id}
          emptyTitle="No auditors assigned"
          columns={[
            { key: 'name', header: 'Auditor', render: (a) => personName(a) },
            { key: 'employeeId', header: 'Employee ID', render: (a) => a.employeeId },
            { key: 'projects', header: 'Assigned projects', render: (a) => (a.projects.length ? a.projects.map((p) => p.name).join(', ') : '—') },
            { key: 'status', header: 'Status', render: (a) => active(a.isActive) },
          ]}
        />
      </Paper>
    </Stack>
  );
}
