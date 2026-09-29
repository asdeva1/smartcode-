'use client';
import * as React from 'react';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { DataTable, Drawer, ErrorState, LoadingState } from '@smartcode/ui';
import type { EmployeeDetail } from '@smartcode/types';
import { formatDate, formatDateTime } from '@/lib/format';
import { useEmployeeDetail } from './use-employees';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Stack direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={500}>
        {value}
      </Typography>
    </Stack>
  );
}

const statusChip = (status: string) => (
  <Chip size="small" label={status} color={status === 'ACTIVE' ? 'success' : 'default'} variant={status === 'ACTIVE' ? 'filled' : 'outlined'} />
);

/**
 * Manager's Employee Directory detail view (docs/09-BUSINESS-RULES.md
 * section 11, Phase 9): Identity / Account / Organization, plus this
 * employee's complete Login Name allocation history. Never renders any
 * password hash, reset token, or access/refresh token - the API itself
 * never returns them (EmployeeDetail carries no such fields).
 */
export function EmployeeDetailDrawer({ employeeRowId, onClose }: { employeeRowId: string | null; onClose: () => void }) {
  const { data, isLoading, isError, refetch } = useEmployeeDetail(employeeRowId);

  return (
    <Drawer open={!!employeeRowId} onClose={onClose} title={data?.fullName ?? data?.loginName ?? 'Employee'} width={560}>
      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState onRetry={() => refetch()} description="Could not load this employee's details." />
      ) : (
        <Stack spacing={2}>
          <Typography variant="subtitle2">Identity</Typography>
          <div>
            <Field label="EMP-ID" value={data.employeeId} />
            <Field label="Full Name" value={data.fullName ?? '—'} />
            <Field label="Email" value={data.email} />
            <Field label="Login Name" value={data.loginName} />
          </div>

          <Divider />
          <Typography variant="subtitle2">Account</Typography>
          <div>
            <Field label="Role" value={data.role} />
            <Field label="Status" value={<Chip size="small" label={data.isActive ? 'Active' : 'Inactive'} color={data.isActive ? 'success' : 'default'} variant={data.isActive ? 'filled' : 'outlined'} />} />
            <Field label="Created Date" value={formatDate(data.createdAt)} />
          </div>

          <Divider />
          <Typography variant="subtitle2">Organization</Typography>
          <div>
            <Field label="Vendor" value={data.vendor?.name ?? '—'} />
            <Field label="Team" value={data.team?.name ?? '—'} />
            <Field label="Team Lead" value={data.teamLead?.fullName ?? data.teamLead?.loginName ?? '—'} />
          </div>

          <Divider />
          <Typography variant="subtitle2">Login Name Allocation History</Typography>
          <DataTable
            isLoading={false}
            rows={data.loginNameHistory}
            rowKey={(r) => r.id}
            emptyTitle="No allocation history"
            columns={[
              { key: 'loginName', header: 'Login Name', render: (r) => r.loginName },
              { key: 'allocated', header: 'Allocated', render: (r) => formatDateTime(r.allocatedAt) },
              { key: 'deallocated', header: 'Deallocated', render: (r) => (r.deallocatedAt ? formatDateTime(r.deallocatedAt) : '—') },
              { key: 'status', header: 'Status', render: (r) => statusChip(r.status) },
            ]}
          />
        </Stack>
      )}
    </Drawer>
  );
}
