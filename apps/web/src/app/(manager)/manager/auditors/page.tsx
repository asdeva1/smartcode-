'use client';
import * as React from 'react';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { MoreVertical, RefreshCw, Plus } from 'lucide-react';
import type { Auditor } from '@smartcode/types';
import {
  PageHeader,
  Breadcrumb,
  Button,
  Input,
  FilterBar,
  DataTable,
  Pagination,
  ErrorState,
  ConfirmDialog,
  useToast,
} from '@smartcode/ui';
import { useAuditors, useSetAuditorActive } from '@/features/auditors/use-auditors';
import { CreateAuditorDialog } from '@/features/auditors/CreateAuditorDialog';
import { EditAuditorDialog } from '@/features/auditors/EditAuditorDialog';

const PAGE_SIZE = 25;

const displayName = (a: Auditor) => a.fullName ?? a.loginName;

export default function AuditorsPage() {
  const { showToast } = useToast();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Auditor | null>(null);
  const [confirmTarget, setConfirmTarget] = React.useState<Auditor | null>(null);
  const [menuAnchor, setMenuAnchor] = React.useState<{ el: HTMLElement; row: Auditor } | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useAuditors({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
  });
  const setActive = useSetAuditorActive();

  const handleConfirmDeactivate = () => {
    if (!confirmTarget) return;
    const target = confirmTarget;
    setActive.mutate(
      { id: target.id, isActive: false },
      {
        onSuccess: () => showToast(`${displayName(target)} deactivated.`, 'success'),
        onError: () => showToast('Could not deactivate this Auditor.', 'error'),
      },
    );
    setConfirmTarget(null);
  };

  // Activation is non-destructive, so - as on the Team Leads page - it
  // applies immediately without a confirmation step.
  const handleActivate = (row: Auditor) => {
    setActive.mutate(
      { id: row.id, isActive: true },
      {
        onSuccess: () => showToast(`${displayName(row)} activated.`, 'success'),
        onError: () => showToast('Could not activate this Auditor.', 'error'),
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Auditors"
        description="Manage Auditor accounts."
        breadcrumb={<Breadcrumb items={[{ label: 'Manager', href: '/manager' }, { label: 'Auditors' }]} />}
        actions={
          <Button startIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
            Create Auditor
          </Button>
        }
      />

      <FilterBar>
        <Input
          label="Search"
          placeholder="Name, login, employee ID, or email"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          sx={{ minWidth: 260 }}
        />
        <IconButton onClick={() => refetch()} aria-label="Refresh" disabled={isFetching}>
          <RefreshCw size={18} />
        </IconButton>
      </FilterBar>

      {isError ? (
        <ErrorState onRetry={() => refetch()} description="Could not load Auditors. Please try again." />
      ) : (
        <>
          <DataTable<Auditor>
            isLoading={isLoading}
            rows={data?.data ?? []}
            rowKey={(row) => row.id}
            emptyTitle="No Auditors found"
            emptyDescription="Create an Auditor account to start reviewing coded charts."
            columns={[
              { key: 'employeeId', header: 'Employee ID', render: (r) => r.employeeId },
              { key: 'fullName', header: 'Full Name', render: (r) => r.fullName ?? '—' },
              { key: 'loginName', header: 'Login Name', render: (r) => r.loginName },
              { key: 'email', header: 'Email', render: (r) => r.email },
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
                header: 'Actions',
                align: 'right',
                render: (r) => (
                  <IconButton
                    size="small"
                    aria-label={`Actions for ${displayName(r)}`}
                    onClick={(e) => setMenuAnchor({ el: e.currentTarget, row: r })}
                  >
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

      <CreateAuditorDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditAuditorDialog open={!!editTarget} onClose={() => setEditTarget(null)} auditor={editTarget} />
      <ConfirmDialog
        open={!!confirmTarget}
        title="Deactivate Auditor"
        description={`${confirmTarget ? displayName(confirmTarget) : 'This Auditor'} will no longer be able to log in. Their account and audit records are preserved and this can be reversed at any time.`}
        confirmLabel="Deactivate"
        destructive
        onConfirm={handleConfirmDeactivate}
        onCancel={() => setConfirmTarget(null)}
      />
    </>
  );
}
