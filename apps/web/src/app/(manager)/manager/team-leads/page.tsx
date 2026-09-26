'use client';
import * as React from 'react';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { MoreVertical, RefreshCw, Plus } from 'lucide-react';
import type { TeamLead } from '@smartcode/types';
import {
  PageHeader,
  Breadcrumb,
  Button,
  Input,
  Select,
  FilterBar,
  DataTable,
  Pagination,
  ErrorState,
  ConfirmDialog,
  useToast,
} from '@smartcode/ui';
import { useTeamLeads, useSetTeamLeadActive } from '@/features/team-leads/use-team-leads';
import { useTeams } from '@/features/team-leads/use-teams';
import { CreateTeamLeadDialog } from '@/features/team-leads/CreateTeamLeadDialog';
import { EditTeamLeadDialog } from '@/features/team-leads/EditTeamLeadDialog';

const PAGE_SIZE = 25;

export default function TeamLeadsPage() {
  const { showToast } = useToast();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<'all' | 'active' | 'inactive'>('all');
  const [teamId, setTeamId] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<TeamLead | null>(null);
  const [confirmTarget, setConfirmTarget] = React.useState<TeamLead | null>(null);
  const [menuAnchor, setMenuAnchor] = React.useState<{ el: HTMLElement; row: TeamLead } | null>(null);

  const { data: teams } = useTeams();
  const { data, isLoading, isError, refetch, isFetching } = useTeamLeads({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    status,
    teamId: teamId || undefined,
  });
  const setActive = useSetTeamLeadActive();

  const handleFilterChange = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const handleConfirmDeactivate = () => {
    if (!confirmTarget) return;
    setActive.mutate(
      { id: confirmTarget.id, isActive: false },
      {
        onSuccess: () =>
          showToast(`${confirmTarget.fullName ?? confirmTarget.loginName} deactivated.`, 'success'),
        onError: () => showToast('Could not deactivate this Team Lead.', 'error'),
      },
    );
    setConfirmTarget(null);
  };

  const handleActivate = (row: TeamLead) => {
    setActive.mutate(
      { id: row.id, isActive: true },
      {
        onSuccess: () => showToast(`${row.fullName ?? row.loginName} activated.`, 'success'),
        onError: () => showToast('Could not activate this Team Lead.', 'error'),
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Team Leads"
        description="Manage Team Lead accounts."
        breadcrumb={
          <Breadcrumb items={[{ label: 'Manager', href: '/manager' }, { label: 'Team Leads' }]} />
        }
        actions={
          <Button startIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
            Create Team Lead
          </Button>
        }
      />

      <FilterBar>
        <Input
          label="Search"
          placeholder="Name, login, employee ID, or email"
          value={search}
          onChange={(e) => handleFilterChange(() => setSearch(e.target.value))}
          sx={{ minWidth: 260 }}
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => handleFilterChange(() => setStatus(e.target.value as typeof status))}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          sx={{ minWidth: 160 }}
        />
        <Select
          label="Team"
          value={teamId}
          onChange={(e) => handleFilterChange(() => setTeamId(e.target.value))}
          options={[
            { value: '', label: 'All teams' },
            ...(teams ?? []).map((t) => ({ value: t.id, label: t.name })),
          ]}
          sx={{ minWidth: 180 }}
        />
        <IconButton onClick={() => refetch()} aria-label="Refresh" disabled={isFetching}>
          <RefreshCw size={18} />
        </IconButton>
      </FilterBar>

      {isError ? (
        <ErrorState onRetry={() => refetch()} description="Could not load Team Leads. Please try again." />
      ) : (
        <>
          <DataTable<TeamLead>
            isLoading={isLoading}
            rows={data?.data ?? []}
            rowKey={(row) => row.id}
            emptyTitle="No Team Leads found"
            emptyDescription="Create your first Team Lead account to start building your production team."
            columns={[
              { key: 'employeeId', header: 'Employee ID', render: (r) => r.employeeId },
              { key: 'fullName', header: 'Team Lead Name', render: (r) => r.fullName ?? '—' },
              { key: 'loginName', header: 'Login Name', render: (r) => r.loginName },
              { key: 'email', header: 'Email', render: (r) => r.email },
              { key: 'team', header: 'Team', render: (r) => r.team?.name ?? '—' },
              {
                key: 'status',
                header: 'Status',
                render: (r) => (
                  <Chip
                    label={r.isActive ? 'Active' : 'Inactive'}
                    size="small"
                    color={r.isActive ? 'success' : 'default'}
                    variant={r.isActive ? 'filled' : 'outlined'}
                  />
                ),
              },
              {
                key: 'createdAt',
                header: 'Created Date',
                render: (r) => new Date(r.createdAt).toLocaleDateString(),
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (r) => (
                  <IconButton size="small" onClick={(e) => setMenuAnchor({ el: e.currentTarget, row: r })}>
                    <MoreVertical size={16} />
                  </IconButton>
                ),
              },
            ]}
          />

          {data && data.total > 0 && (
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
          )}
        </>
      )}

      <Menu anchorEl={menuAnchor?.el} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            if (menuAnchor) setEditTarget(menuAnchor.row);
            setMenuAnchor(null);
          }}
        >
          View / Edit
        </MenuItem>
        {menuAnchor?.row.isActive ? (
          <MenuItem
            onClick={() => {
              if (menuAnchor) setConfirmTarget(menuAnchor.row);
              setMenuAnchor(null);
            }}
          >
            Deactivate
          </MenuItem>
        ) : (
          <MenuItem
            onClick={() => {
              if (menuAnchor) handleActivate(menuAnchor.row);
              setMenuAnchor(null);
            }}
          >
            Activate
          </MenuItem>
        )}
      </Menu>

      <CreateTeamLeadDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditTeamLeadDialog open={!!editTarget} onClose={() => setEditTarget(null)} teamLead={editTarget} />
      <ConfirmDialog
        open={!!confirmTarget}
        title="Deactivate Team Lead"
        description={`${confirmTarget?.fullName ?? confirmTarget?.loginName ?? 'This Team Lead'} will no longer be able to log in. Their account and records are preserved and this can be reversed at any time.`}
        confirmLabel="Deactivate"
        destructive
        onConfirm={handleConfirmDeactivate}
        onCancel={() => setConfirmTarget(null)}
      />
    </>
  );
}
