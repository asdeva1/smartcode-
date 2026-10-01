'use client';
import * as React from 'react';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import { RefreshCw } from 'lucide-react';
import type { EmployeeRow } from '@smartcode/types';
import { DataTable, ErrorState, FilterBar, Input, Pagination, Select } from '@smartcode/ui';
import { formatDate } from '@/lib/format';
import { useEmployees } from './use-employees';
import { EmployeeDetailDrawer } from './EmployeeDetailDrawer';

const PAGE_SIZE = 25;

/**
 * Manager-only Employee Directory (docs/09-BUSINESS-RULES.md section 11 /
 * Phase 9) - a searchable, paginated, enterprise-wide account directory.
 * Not a CRM/ATS: no Online/Offline column (no presence data exists yet -
 * this phase does not invent one). Search and every filter are server-side;
 * the full employee list is never loaded into the browser at once.
 */
export function EmployeeDirectoryManager() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [role, setRole] = React.useState<string>('all');
  const [status, setStatus] = React.useState<'all' | 'active' | 'inactive'>('all');
  const [selected, setSelected] = React.useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useEmployees({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    role: role === 'all' ? undefined : role,
    status,
  });

  return (
    <>
      <FilterBar>
        <Input
          label="Search"
          placeholder="EMP-ID, Name, Login Name, or Email"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          sx={{ minWidth: 280 }}
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
            { value: 'MANAGER', label: 'Manager' },
            { value: 'VENDOR', label: 'Vendor' },
            { value: 'TEAM_LEAD', label: 'Team Lead' },
            { value: 'AUDITOR', label: 'Auditor' },
            { value: 'CODER', label: 'Coder' },
          ]}
          sx={{ minWidth: 160 }}
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          sx={{ minWidth: 160 }}
        />
        <IconButton onClick={() => refetch()} aria-label="Refresh" disabled={isFetching}>
          <RefreshCw size={18} />
        </IconButton>
      </FilterBar>

      {isError ? (
        <ErrorState onRetry={() => refetch()} description="Could not load the Employee Directory. Please try again." />
      ) : (
        <>
          <DataTable<EmployeeRow>
            isLoading={isLoading}
            rows={data?.data ?? []}
            rowKey={(r) => r.id}
            onRowClick={(r) => setSelected(r.id)}
            emptyTitle="No employees found"
            emptyDescription="Try a different search, or widen the filters."
            columns={[
              { key: 'employeeId', header: 'EMP-ID', render: (r) => r.employeeId },
              { key: 'fullName', header: 'Employee Name', render: (r) => r.fullName ?? '—' },
              { key: 'loginName', header: 'Login Name', render: (r) => r.loginName },
              { key: 'email', header: 'Email', render: (r) => r.email },
              { key: 'role', header: 'Role', render: (r) => r.role },
              { key: 'vendor', header: 'Vendor', render: (r) => r.vendor?.name ?? '—' },
              { key: 'team', header: 'Team', render: (r) => r.team?.name ?? '—' },
              { key: 'teamLead', header: 'Team Lead', render: (r) => r.teamLead?.fullName ?? r.teamLead?.loginName ?? '—' },
              {
                key: 'assignedProjects',
                header: 'Assigned Project(s)',
                render: (r) => (r.assignedProjects === null || r.assignedProjects === undefined ? 'Enterprise' : r.assignedProjects.length ? r.assignedProjects.map((p) => p.name).join(', ') : '—'),
              },
              {
                key: 'status',
                header: 'Active/Inactive',
                render: (r) => (
                  <Chip label={r.isActive ? 'Active' : 'Inactive'} size="small" color={r.isActive ? 'success' : 'default'} variant={r.isActive ? 'filled' : 'outlined'} />
                ),
              },
              { key: 'createdAt', header: 'Created Date', render: (r) => formatDate(r.createdAt) },
            ]}
          />
          {data && data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
        </>
      )}

      <EmployeeDetailDrawer employeeRowId={selected} onClose={() => setSelected(null)} />
    </>
  );
}
