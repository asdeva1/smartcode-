'use client';
import * as React from 'react';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { DataTable, Drawer, ErrorState, LoadingState } from '@smartcode/ui';
import type { LoginNameAllocationRow } from '@smartcode/types';
import { formatDateTime } from '@/lib/format';
import { useLoginNameAllocationDetail } from './use-login-name-allocations';

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
 * Manager's "click a record" view (docs/09-BUSINESS-RULES.md section 10
 * / Phase 9): current allocation, then the complete append-only history
 * for this exact Login Name - old allocations always remain visible.
 */
export function LoginNameDetailDrawer({ loginName, onClose }: { loginName: string | null; onClose: () => void }) {
  const { data, isLoading, isError, refetch } = useLoginNameAllocationDetail(loginName);

  return (
    <Drawer open={!!loginName} onClose={onClose} title={loginName ?? 'Login Name'} width={560}>
      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState onRetry={() => refetch()} description="Could not load this Login Name's allocation history." />
      ) : (
        <Stack spacing={2}>
          <Typography variant="subtitle2">Current Allocation</Typography>
          {data.current ? (
            <div>
              <Field label="Employee" value={data.current.user.fullName ?? data.current.user.loginName} />
              <Field label="EMP-ID" value={data.current.user.employeeId} />
              <Field label="Role" value={data.current.user.role} />
              <Field label="Vendor" value={data.current.user.vendor?.name ?? '—'} />
              <Field label="Team" value={data.current.user.team?.name ?? '—'} />
              <Field label="Team Lead" value={data.current.user.teamLead?.fullName ?? data.current.user.teamLead?.loginName ?? '—'} />
              <Field label="Status" value={statusChip(data.current.status)} />
              <Field label="Allocated" value={formatDateTime(data.current.allocatedAt)} />
            </div>
          ) : (
            <Typography variant="body2" color="text.secondary">
              This Login Name has no current active allocation.
            </Typography>
          )}

          <Typography variant="subtitle2">Allocation History</Typography>
          <DataTable<LoginNameAllocationRow>
            isLoading={false}
            rows={data.history}
            rowKey={(r) => r.id}
            emptyTitle="No allocation history"
            columns={[
              { key: 'employee', header: 'Employee', render: (r) => r.user.fullName ?? r.user.loginName },
              { key: 'empId', header: 'EMP-ID', render: (r) => r.employeeId },
              { key: 'role', header: 'Role', render: (r) => r.user.role },
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
