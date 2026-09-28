'use client';
import * as React from 'react';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import { RefreshCw } from 'lucide-react';
import type { PasswordResetRequestRow } from '@smartcode/types';
import { Button, DataTable, ErrorState, FilterBar, Pagination, Select } from '@smartcode/ui';
import { formatDateTime, personName } from '@/lib/format';
import { usePasswordResetRequests } from './use-password-reset-requests';
import { ApprovePasswordResetRequestDialog } from './ApprovePasswordResetRequestDialog';
import { RejectPasswordResetRequestDialog } from './RejectPasswordResetRequestDialog';

const PAGE_SIZE = 25;

const statusChip = (status: string) => (
  <Chip
    size="small"
    label={status}
    color={status === 'PENDING' ? 'warning' : status === 'APPROVED' || status === 'COMPLETED' ? 'success' : 'default'}
    variant={status === 'PENDING' ? 'filled' : 'outlined'}
  />
);

/**
 * Manager's queue for the password-reset request/approval/link workflow
 * (docs/09-BUSINESS-RULES.md section 8, Phase 8): a Vendor or Team Lead
 * files a request for one of their own-scope Coders; only a Manager can
 * approve (generating a single-use reset link, shown once) or reject
 * (with a reason, generating no link) it. Mirrors
 * features/approvals/ApprovalsManager.tsx's structure.
 */
export function PasswordResetRequestsManager() {
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'all'>('PENDING');
  const [approveTarget, setApproveTarget] = React.useState<PasswordResetRequestRow | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<PasswordResetRequestRow | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = usePasswordResetRequests({ page, pageSize: PAGE_SIZE, status });

  return (
    <>
      <FilterBar>
        <Select
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
          options={[
            { value: 'PENDING', label: 'Pending' },
            { value: 'APPROVED', label: 'Approved' },
            { value: 'REJECTED', label: 'Rejected' },
            { value: 'COMPLETED', label: 'Completed' },
            { value: 'all', label: 'All statuses' },
          ]}
          sx={{ minWidth: 160 }}
        />
        <IconButton onClick={() => refetch()} aria-label="Refresh" disabled={isFetching}>
          <RefreshCw size={18} />
        </IconButton>
      </FilterBar>

      {isError ? (
        <ErrorState onRetry={() => refetch()} description="Could not load password reset requests. Please try again." />
      ) : (
        <>
          <DataTable<PasswordResetRequestRow>
            isLoading={isLoading}
            rows={data?.data ?? []}
            rowKey={(r) => r.id}
            emptyTitle="No requests found"
            emptyDescription="Password reset requests filed by a Vendor or Team Lead for one of their own Coders will show up here."
            columns={[
              { key: 'target', header: 'Target Employee', render: (r) => personName(r.targetUser) },
              { key: 'loginName', header: 'Login Name', render: (r) => r.targetUser.loginName },
              { key: 'employeeId', header: 'EMP ID', render: (r) => r.targetUser.employeeId },
              { key: 'role', header: 'Role', render: (r) => r.targetUser.role },
              { key: 'vendor', header: 'Vendor', render: (r) => r.targetUser.vendor?.name ?? '—' },
              { key: 'team', header: 'Team', render: (r) => r.targetUser.team?.name ?? '—' },
              { key: 'requestedBy', header: 'Requested By', render: (r) => personName(r.requestedBy) },
              { key: 'requestedAt', header: 'Request Date', render: (r) => formatDateTime(r.requestedAt) },
              { key: 'status', header: 'Status', render: (r) => statusChip(r.status) },
              {
                key: 'reviewed',
                header: 'Reviewed',
                render: (r) => (r.reviewedBy ? `${personName(r.reviewedBy)} • ${formatDateTime(r.reviewedAt!)}` : '—'),
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (r) =>
                  r.status === 'PENDING' ? (
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button size="small" variant="text" onClick={() => setApproveTarget(r)}>
                        Approve
                      </Button>
                      <Button size="small" variant="text" color="error" onClick={() => setRejectTarget(r)}>
                        Reject
                      </Button>
                    </Stack>
                  ) : (
                    r.rejectionReason ?? null
                  ),
              },
            ]}
          />
          {data && data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
        </>
      )}

      <ApprovePasswordResetRequestDialog target={approveTarget} onClose={() => setApproveTarget(null)} />
      <RejectPasswordResetRequestDialog
        requestId={rejectTarget?.id ?? null}
        label={rejectTarget ? personName(rejectTarget.targetUser) : ''}
        onClose={() => setRejectTarget(null)}
      />
    </>
  );
}
