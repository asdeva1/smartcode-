'use client';
import * as React from 'react';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Eye, RefreshCw } from 'lucide-react';
import type { Rework, Role } from '@smartcode/types';
import { Button, DataTable, ErrorState, FilterBar, Input, Pagination, Select } from '@smartcode/ui';
import { VendorFilter } from '@/components/data/VendorFilter';
import { REWORK_STATUS_FILTER_OPTIONS, formatDateTime, personName } from '@/lib/format';
import { ReworkStatusChip } from './ReworkStatusChip';
import { ReworkDetailDrawer } from './ReworkDetailDrawer';
import { ResolveReworkDialog } from './ResolveReworkDialog';
import { useReworkList } from './use-rework';

const PAGE_SIZE = 25;

/**
 * Rework list shared by every role; the API scopes the rows (Coder own,
 * Team Lead team, Auditor requested/assigned, Vendor own vendor, Manager
 * all). `openId` deep-links from a dashboard card or notification.
 */
export function ReworkTable({ role, openId, fixedVendorId }: { role: Role; openId?: string | null; fixedVendorId?: string }) {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState(role === 'AUDITOR' ? 'RESOLVED' : 'pending');
  const [vendorId, setVendorId] = React.useState('');
  const [detail, setDetail] = React.useState<string | null>(openId ?? null);
  const [resolving, setResolving] = React.useState<Rework | null>(null);
  const { data, isLoading, isError, refetch, isFetching } = useReworkList({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    status: status || undefined,
    vendorId: role === 'MANAGER' ? fixedVendorId ?? (vendorId || undefined) : undefined,
  });
  const filter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  return (
    <>
      <FilterBar>
        <Input label="Search Chart ID" value={search} onChange={(e) => filter(() => setSearch(e.target.value))} sx={{ minWidth: 200 }} />
        <Select label="Rework status" value={status} onChange={(e) => filter(() => setStatus(e.target.value))} options={REWORK_STATUS_FILTER_OPTIONS} sx={{ minWidth: 240 }} />
        {role === 'MANAGER' && !fixedVendorId && <VendorFilter value={vendorId} onChange={(v) => filter(() => setVendorId(v))} />}
        <IconButton onClick={() => refetch()} aria-label="Refresh" disabled={isFetching}>
          <RefreshCw size={18} />
        </IconButton>
      </FilterBar>

      {isError ? (
        <ErrorState onRetry={() => refetch()} description="Could not load rework. Please try again." />
      ) : (
        <>
          <DataTable<Rework>
            isLoading={isLoading}
            rows={data?.data ?? []}
            rowKey={(r) => r.id}
            emptyTitle="No rework found"
            emptyDescription={status === 'pending' ? 'Nothing is waiting for rework.' : 'No rework matches the current filters.'}
            columns={[
              {
                key: 'chartId',
                header: 'Chart ID',
                render: (r) => (
                  <>
                    {r.chartId}
                    {r.unread && <Chip size="small" color="error" label="New" sx={{ ml: 0.75 }} />}
                  </>
                ),
              },
              { key: 'project', header: 'Project', render: (r) => r.project?.name ?? '—' },
              ...(role === 'CODER' ? [] : [{ key: 'coder', header: 'Coder', render: (r: Rework) => personName(r.coder) }]),
              ...(role === 'AUDITOR' ? [] : [{ key: 'auditor', header: 'Auditor', render: (r: Rework) => personName(r.auditor) }]),
              {
                key: 'reason',
                header: 'Rework reason',
                render: (r) => (
                  <Tooltip title={r.reason}>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 260 }}>
                      {r.reason}
                    </Typography>
                  </Tooltip>
                ),
              },
              { key: 'requested', header: 'Requested', render: (r) => formatDateTime(r.createdAt) },
              { key: 'status', header: 'Status', render: (r) => <ReworkStatusChip status={r.status} /> },
              { key: 'resolved', header: 'Resolved', render: (r) => formatDateTime(r.resolvedAt) },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: (r) => (
                  <>
                    {role === 'CODER' && (r.status === 'OPEN' || r.status === 'IN_PROGRESS') && (
                      <Button size="small" onClick={() => setResolving(r)} aria-label={`Resolve rework for ${r.chartId}`} sx={{ mr: 0.5 }}>
                        Resolve
                      </Button>
                    )}
                    <IconButton size="small" aria-label={`View rework for ${r.chartId}`} onClick={() => setDetail(r.id)}>
                      <Eye size={16} />
                    </IconButton>
                  </>
                ),
              },
            ]}
          />
          {data && data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
        </>
      )}

      <ReworkDetailDrawer
        id={detail}
        role={role}
        onClose={() => setDetail(null)}
        onResolve={(r) => {
          setDetail(null);
          setResolving(r);
        }}
      />
      {resolving && <ResolveReworkDialog rework={resolving} onClose={() => setResolving(null)} />}
    </>
  );
}
