'use client';
import * as React from 'react';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import { RefreshCw } from 'lucide-react';
import type { LoginNameAllocationRow } from '@smartcode/types';
import { DataTable, ErrorState, FilterBar, Input, Pagination, Select } from '@smartcode/ui';
import { formatDateTime } from '@/lib/format';
import { useLoginNameAllocations } from './use-login-name-allocations';
import { LoginNameDetailDrawer } from './LoginNameDetailDrawer';

const PAGE_SIZE = 25;

const statusChip = (status: string) => (
  <Chip size="small" label={status} color={status === 'ACTIVE' ? 'success' : 'default'} variant={status === 'ACTIVE' ? 'filled' : 'outlined'} />
);

/**
 * Manager's Login Name Details search (docs/09-BUSINESS-RULES.md section
 * 10 / Phase 9). Defaults to the live ACTIVE directory; clicking a row
 * opens the current allocation + complete history for that exact Login
 * Name (LoginNameDetailDrawer).
 */
export function LoginNameDetailsManager() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<'ACTIVE' | 'DEACTIVATED' | 'REALLOCATED' | 'all'>('ACTIVE');
  const [role, setRole] = React.useState<string>('all');
  const [selected, setSelected] = React.useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useLoginNameAllocations({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    status,
    role: role === 'all' ? undefined : role,
  });

  return (
    <>
      <FilterBar>
        <Input
          label="Search"
          placeholder="Login Name, Employee ID, Name, or Email"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          sx={{ minWidth: 280 }}
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
          options={[
            { value: 'ACTIVE', label: 'Active' },
            { value: 'REALLOCATED', label: 'Reallocated' },
            { value: 'DEACTIVATED', label: 'Deactivated' },
            { value: 'all', label: 'All statuses' },
          ]}
          sx={{ minWidth: 160 }}
        />
        <Select
          label="Role"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All roles' },
            { value: 'TEAM_LEAD', label: 'Team Lead' },
            { value: 'CODER', label: 'Coder' },
            { value: 'AUDITOR', label: 'Auditor' },
            { value: 'VENDOR', label: 'Vendor' },
            { value: 'MANAGER', label: 'Manager' },
          ]}
          sx={{ minWidth: 160 }}
        />
        <IconButton onClick={() => refetch()} aria-label="Refresh" disabled={isFetching}>
          <RefreshCw size={18} />
        </IconButton>
      </FilterBar>

      {isError ? (
        <ErrorState onRetry={() => refetch()} description="Could not load Login Name allocations. Please try again." />
      ) : (
        <>
          <DataTable<LoginNameAllocationRow>
            isLoading={isLoading}
            rows={data?.data ?? []}
            rowKey={(r) => r.id}
            onRowClick={(r) => setSelected(r.loginName)}
            emptyTitle="No Login Names found"
            emptyDescription="Try a different search, or widen the status filter."
            columns={[
              { key: 'loginName', header: 'Login Name', render: (r) => r.loginName },
              { key: 'employeeId', header: 'Employee ID', render: (r) => r.employeeId },
              { key: 'employeeName', header: 'Employee Name', render: (r) => r.user.fullName ?? '—' },
              { key: 'role', header: 'Role', render: (r) => r.user.role },
              { key: 'vendor', header: 'Vendor', render: (r) => r.user.vendor?.name ?? '—' },
              { key: 'team', header: 'Team', render: (r) => r.user.team?.name ?? '—' },
              { key: 'teamLead', header: 'Team Lead', render: (r) => r.user.teamLead?.fullName ?? r.user.teamLead?.loginName ?? '—' },
              { key: 'allocated', header: 'Allocated Date', render: (r) => formatDateTime(r.allocatedAt) },
              { key: 'deallocated', header: 'Deactivated/Reallocated', render: (r) => (r.deallocatedAt ? formatDateTime(r.deallocatedAt) : '—') },
              { key: 'status', header: 'Status', render: (r) => statusChip(r.status) },
            ]}
          />
          {data && data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
        </>
      )}

      <LoginNameDetailDrawer loginName={selected} onClose={() => setSelected(null)} />
    </>
  );
}
