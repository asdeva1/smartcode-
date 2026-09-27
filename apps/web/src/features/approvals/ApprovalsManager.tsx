'use client';
import * as React from 'react';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import { RefreshCw } from 'lucide-react';
import type { ApprovalRequest, LoginNameChangePayload } from '@smartcode/types';
import { Button, ConfirmDialog, DataTable, ErrorState, FilterBar, Pagination, Select, useToast } from '@smartcode/ui';
import { errorMessage, formatDateTime, personName } from '@/lib/format';
import { useApprovals, useApproveRequest } from './use-approvals';
import { RejectRequestDialog } from './RejectRequestDialog';

const PAGE_SIZE = 25;

const statusChip = (status: string) => (
  <Chip
    size="small"
    label={status}
    color={status === 'PENDING' ? 'warning' : status === 'APPROVED' ? 'success' : 'default'}
    variant={status === 'PENDING' ? 'filled' : 'outlined'}
  />
);

const typeLabel = (type: string) => (type === 'LOGIN_NAME_CHANGE' ? 'Login Name Change' : type);

/**
 * Universal Approval Engine (docs/09-BUSINESS-RULES.md section 9) - the
 * Manager's queue. LOGIN_NAME_CHANGE is the first workflow through it;
 * this table renders `payload` generically enough that a future
 * approval type doesn't need a new screen, just a case in `describe()`.
 */
export function ApprovalsManager() {
  const { showToast } = useToast();
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'all'>('PENDING');
  const [approveTarget, setApproveTarget] = React.useState<ApprovalRequest | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<ApprovalRequest | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useApprovals({ page, pageSize: PAGE_SIZE, status });
  const approve = useApproveRequest();

  const describe = (row: ApprovalRequest) => {
    if (row.type === 'LOGIN_NAME_CHANGE') {
      const payload = row.payload as LoginNameChangePayload;
      return `${payload.currentLoginName} → ${payload.requestedLoginName}`;
    }
    return '—';
  };

  const handleApprove = () => {
    if (!approveTarget) return;
    const target = approveTarget;
    approve.mutate(target.id, {
      onSuccess: () => showToast(`Approved: ${personName(target.targetUser)}'s ${typeLabel(target.type).toLowerCase()}.`, 'success'),
      onError: (err) => showToast(errorMessage(err, 'Could not approve this request.'), 'error'),
    });
    setApproveTarget(null);
  };

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
            { value: 'all', label: 'All statuses' },
          ]}
          sx={{ minWidth: 160 }}
        />
        <IconButton onClick={() => refetch()} aria-label="Refresh" disabled={isFetching}>
          <RefreshCw size={18} />
        </IconButton>
      </FilterBar>

      {isError ? (
        <ErrorState onRetry={() => refetch()} description="Could not load approval requests. Please try again." />
      ) : (
        <>
          <DataTable<ApprovalRequest>
            isLoading={isLoading}
            rows={data?.data ?? []}
            rowKey={(r) => r.id}
            emptyTitle="No requests found"
            emptyDescription="Requests that need your approval - such as a Team Lead's Coder Login Name change - will show up here."
            columns={[
              { key: 'type', header: 'Type', render: (r) => typeLabel(r.type) },
              { key: 'target', header: 'Coder', render: (r) => personName(r.targetUser) },
              { key: 'change', header: 'Change', render: describe },
              { key: 'requestedBy', header: 'Requested By', render: (r) => personName(r.requestedBy) },
              { key: 'requestedAt', header: 'Requested Date', render: (r) => formatDateTime(r.requestedAt) },
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

      <ConfirmDialog
        open={!!approveTarget}
        title="Approve request"
        description={
          approveTarget
            ? `Approve ${personName(approveTarget.targetUser)}'s ${typeLabel(approveTarget.type).toLowerCase()} (${describe(approveTarget)})? This applies the change immediately.`
            : ''
        }
        confirmLabel="Approve"
        onConfirm={handleApprove}
        onCancel={() => setApproveTarget(null)}
      />
      <RejectRequestDialog
        requestId={rejectTarget?.id ?? null}
        label={rejectTarget ? personName(rejectTarget.targetUser) : ''}
        onClose={() => setRejectTarget(null)}
      />
    </>
  );
}
