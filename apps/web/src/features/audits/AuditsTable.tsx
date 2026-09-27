'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { MoreVertical, RefreshCw } from 'lucide-react';
import type { AuditEntry, Role } from '@smartcode/types';
import { DataTable, DatePicker, ErrorState, FilterBar, Input, Pagination, Select, StatusBadge } from '@smartcode/ui';
import { ExportMenu } from '@/components/data/ExportMenu';
import { VendorFilter } from '@/components/data/VendorFilter';
import { ChartDetailDrawer } from '@/features/charts/ChartDetailDrawer';
import { AUDIT_STATUS_OPTIONS, formatDate, personName } from '@/lib/format';
import { useAuditList } from './use-audits';
import { ResolveAuditDialog } from './ResolveAuditDialog';

const PAGE_SIZE = 25;
type Action = 'continue' | 'reaudit' | 'resolve' | 'chart';

/** Which row actions a role sees; the backend enforces the same rules independently. */
export function auditActions(role: Role, a: AuditEntry, myId?: string): Action[] {
  const out: Action[] = [];
  if (role === 'AUDITOR' && a.auditor.id === myId && (a.status === 'PENDING' || a.status === 'IN_PROGRESS')) out.push('continue');
  if (role === 'AUDITOR' && a.status === 'REJECTED') out.push('reaudit');
  if ((role === 'TEAM_LEAD' || role === 'MANAGER') && a.status === 'REVIEW_REQUIRED') out.push('resolve');
  out.push('chart');
  return out;
}

const LABEL: Record<Action, string> = { continue: 'Continue audit', reaudit: 'Re-audit', resolve: 'Resolve review', chart: 'Chart history' };

/** Audit list: Auditor (own), Team Lead (team charts), Manager (all). COMPLETED audits have no edit action. */
export function AuditsTable({ role, userId, toolbar }: { role: Role; userId?: string; toolbar?: React.ReactNode }) {
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [vendorId, setVendorId] = React.useState('');
  const [menu, setMenu] = React.useState<{ el: HTMLElement; row: AuditEntry } | null>(null);
  const [resolveTarget, setResolveTarget] = React.useState<AuditEntry | null>(null);
  const [chart, setChart] = React.useState<string | null>(null);

  const filters = {
    search: search || undefined,
    status: status || undefined,
    from: from || undefined,
    to: to || undefined,
    vendorId: role === 'MANAGER' ? vendorId || undefined : undefined,
  };
  const { data, isLoading, isError, refetch, isFetching } = useAuditList({ page, pageSize: PAGE_SIZE, ...filters });
  const filter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const run = (action: Action, row: AuditEntry) => {
    if (action === 'resolve') setResolveTarget(row);
    else if (action === 'chart') setChart(row.chartId);
    else router.push(`/auditor/audit-entry?chartId=${encodeURIComponent(row.chartId)}`);
  };

  return (
    <>
      <FilterBar>
        <Input label="Search Chart ID" value={search} onChange={(e) => filter(() => setSearch(e.target.value))} sx={{ minWidth: 200 }} />
        <Select label="Status" value={status} onChange={(e) => filter(() => setStatus(e.target.value))} options={AUDIT_STATUS_OPTIONS} sx={{ minWidth: 170 }} />
        <DatePicker label="Audited from" value={from} onChange={(e) => filter(() => setFrom(e.target.value))} sx={{ maxWidth: 170 }} />
        <DatePicker label="Audited to" value={to} onChange={(e) => filter(() => setTo(e.target.value))} sx={{ maxWidth: 170 }} />
        {role === 'MANAGER' && <VendorFilter value={vendorId} onChange={(v) => filter(() => setVendorId(v))} />}
        <IconButton onClick={() => refetch()} aria-label="Refresh" disabled={isFetching}>
          <RefreshCw size={18} />
        </IconButton>
        <ExportMenu path="/audits/export" params={filters} />
        {toolbar}
      </FilterBar>

      {isError ? (
        <ErrorState onRetry={() => refetch()} description="Could not load audits. Please try again." />
      ) : (
        <>
          <DataTable<AuditEntry>
            isLoading={isLoading}
            rows={data?.data ?? []}
            rowKey={(a) => a.id}
            emptyTitle="No audits found"
            emptyDescription={role === 'AUDITOR' ? 'Audits you record appear here.' : 'No audits match the current filters.'}
            columns={[
              { key: 'chartId', header: 'Chart ID', render: (a) => a.chartId },
              { key: 'version', header: 'Prod. ver.', align: 'right', render: (a) => a.productionVersion },
              { key: 'project', header: 'Project', render: (a) => a.project?.name ?? '—' },
              { key: 'coder', header: 'Coder', render: (a) => personName(a.coder) },
              ...(role === 'AUDITOR' ? [] : [{ key: 'auditor', header: 'Auditor', render: (a: AuditEntry) => personName(a.auditor) }]),
              { key: 'auditErrors', header: 'Audit Errors', align: 'right', render: (a) => a.auditErrors },
              { key: 'errorExceptions', header: 'Error Exceptions', align: 'right', render: (a) => a.errorExceptions },
              { key: 'totalErrors', header: 'Total Errors', align: 'right', render: (a) => a.totalErrors },
              { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
              { key: 'auditDate', header: 'Audit Date', render: (a) => formatDate(a.auditDate) },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: (a) => (
                  <IconButton size="small" aria-label={`Actions for ${a.chartId}`} onClick={(e) => setMenu({ el: e.currentTarget, row: a })}>
                    <MoreVertical size={16} />
                  </IconButton>
                ),
              },
            ]}
          />
          {data && data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
        </>
      )}

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        {menu &&
          auditActions(role, menu.row, userId).map((action) => (
            <MenuItem
              key={action}
              onClick={() => {
                run(action, menu.row);
                setMenu(null);
              }}
            >
              {LABEL[action]}
            </MenuItem>
          ))}
      </Menu>
      <ResolveAuditDialog audit={resolveTarget} onClose={() => setResolveTarget(null)} />
      <ChartDetailDrawer chartId={chart} role={role} onClose={() => setChart(null)} />
    </>
  );
}
