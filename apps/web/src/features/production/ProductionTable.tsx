'use client';
import * as React from 'react';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { MoreVertical, RefreshCw } from 'lucide-react';
import type { ProductionEntry, Role } from '@smartcode/types';
import {
  ConfirmDialog,
  DataTable,
  DatePicker,
  ErrorState,
  FilterBar,
  Input,
  Pagination,
  Select,
  StatusBadge,
  useToast,
} from '@smartcode/ui';
import { ExportMenu } from '@/components/data/ExportMenu';
import { VendorFilter } from '@/components/data/VendorFilter';
import { PRODUCTION_STATUS_OPTIONS, errorMessage, formatDate, personName } from '@/lib/format';
import { useProductionAction, useProductionList } from './use-production';
import { EditProductionDialog } from './EditProductionDialog';

const PAGE_SIZE = 25;
const EDITABLE = ['PENDING', 'IN_PROGRESS', 'REWORK'];

type Action = 'edit' | 'rework' | 'cancel';

/** Which row actions a role can see. The backend enforces the same rules independently. */
export function productionActions(role: Role, row: ProductionEntry): Action[] {
  if (!row.isCurrent) return [];
  const actions: Action[] = [];
  if (role === 'CODER' && EDITABLE.includes(row.status)) actions.push('edit');
  if ((role === 'CODER' || role === 'TEAM_LEAD' || role === 'MANAGER') && row.status === 'COMPLETED') actions.push('rework');
  if ((role === 'TEAM_LEAD' || role === 'MANAGER') && row.status !== 'CANCELLED' && row.auditCount === 0) actions.push('cancel');
  return actions;
}

const CONFIRM: Record<'rework' | 'cancel', { title: string; label: string; text: (r: ProductionEntry) => string }> = {
  rework: {
    title: 'Send to rework',
    label: 'Send to rework',
    text: (r) => `Chart ${r.chartId} version ${r.version} stays in history unchanged. A new version ${r.version + 1} is created for correction.`,
  },
  cancel: {
    title: 'Cancel production',
    label: 'Cancel production',
    text: (r) => `Chart ${r.chartId} version ${r.version} will be marked CANCELLED. The record is kept, not deleted.`,
  },
};

/** Production list shared by Coder (own), Team Lead (team) and Manager (all); the API scopes the rows. */
export function ProductionTable({ role }: { role: Role }) {
  const { showToast } = useToast();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [vendorId, setVendorId] = React.useState('');
  const [menu, setMenu] = React.useState<{ el: HTMLElement; row: ProductionEntry } | null>(null);
  const [editTarget, setEditTarget] = React.useState<ProductionEntry | null>(null);
  const [confirm, setConfirm] = React.useState<{ action: 'rework' | 'cancel'; row: ProductionEntry } | null>(null);

  const filters = {
    search: search || undefined,
    status: status || undefined,
    from: from || undefined,
    to: to || undefined,
    vendorId: role === 'MANAGER' ? vendorId || undefined : undefined,
  };
  const { data, isLoading, isError, refetch, isFetching } = useProductionList({ page, pageSize: PAGE_SIZE, ...filters });
  const act = useProductionAction();
  const filter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const runConfirmed = () => {
    if (!confirm) return;
    const { action, row } = confirm;
    act.mutate(
      { id: row.id, action },
      {
        onSuccess: () => showToast(action === 'rework' ? `Chart ${row.chartId} sent to rework.` : `Chart ${row.chartId} cancelled.`, 'success'),
        onError: (err) => showToast(errorMessage(err, 'Action failed.'), 'error'),
      },
    );
    setConfirm(null);
  };

  const columns = [
    { key: 'chartId', header: 'Chart ID', render: (r: ProductionEntry) => r.chartId },
    { key: 'version', header: 'Ver.', align: 'right' as const, render: (r: ProductionEntry) => r.version },
    { key: 'project', header: 'Project', render: (r: ProductionEntry) => r.project?.name ?? '—' },
    ...(role === 'CODER'
      ? []
      : [
          { key: 'coder', header: 'Coder', render: (r: ProductionEntry) => personName(r.coder) },
          { key: 'employeeId', header: 'Employee ID', render: (r: ProductionEntry) => r.coder.employeeId },
        ]),
    { key: 'pageCount', header: 'Pages', align: 'right' as const, render: (r: ProductionEntry) => r.pageCount },
    { key: 'totalICDs', header: 'Total ICDs', align: 'right' as const, render: (r: ProductionEntry) => r.totalICDs },
    { key: 'totalDOS', header: 'Total DOS', align: 'right' as const, render: (r: ProductionEntry) => r.totalDOS },
    { key: 'status', header: 'Status', render: (r: ProductionEntry) => <StatusBadge status={r.status} /> },
    { key: 'codedDate', header: 'Coded Date', render: (r: ProductionEntry) => formatDate(r.codedDate) },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      render: (r: ProductionEntry) =>
        productionActions(role, r).length ? (
          <IconButton size="small" aria-label={`Actions for ${r.chartId}`} onClick={(e) => setMenu({ el: e.currentTarget, row: r })}>
            <MoreVertical size={16} />
          </IconButton>
        ) : null,
    },
  ];

  return (
    <>
      <FilterBar>
        <Input label="Search Chart ID" value={search} onChange={(e) => filter(() => setSearch(e.target.value))} sx={{ minWidth: 200 }} />
        <Select label="Status" value={status} onChange={(e) => filter(() => setStatus(e.target.value))} options={PRODUCTION_STATUS_OPTIONS} sx={{ minWidth: 160 }} />
        <DatePicker label="Coded from" value={from} onChange={(e) => filter(() => setFrom(e.target.value))} sx={{ maxWidth: 170 }} />
        <DatePicker label="Coded to" value={to} onChange={(e) => filter(() => setTo(e.target.value))} sx={{ maxWidth: 170 }} />
        {role === 'MANAGER' && <VendorFilter value={vendorId} onChange={(v) => filter(() => setVendorId(v))} />}
        <IconButton onClick={() => refetch()} aria-label="Refresh" disabled={isFetching}>
          <RefreshCw size={18} />
        </IconButton>
        <ExportMenu path="/production/export" params={filters} />
      </FilterBar>

      {isError ? (
        <ErrorState onRetry={() => refetch()} description="Could not load production. Please try again." />
      ) : (
        <>
          <DataTable<ProductionEntry>
            isLoading={isLoading}
            rows={data?.data ?? []}
            rowKey={(r) => r.id}
            emptyTitle="No production records found"
            emptyDescription={role === 'CODER' ? 'Add production to see it here.' : 'No production matches the current filters.'}
            columns={columns}
          />
          {data && data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
        </>
      )}

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        {menu &&
          productionActions(role, menu.row).map((action) => (
            <MenuItem
              key={action}
              onClick={() => {
                if (action === 'edit') setEditTarget(menu.row);
                else setConfirm({ action, row: menu.row });
                setMenu(null);
              }}
            >
              {action === 'edit' ? 'Edit' : CONFIRM[action].label}
            </MenuItem>
          ))}
      </Menu>

      <EditProductionDialog entry={editTarget} onClose={() => setEditTarget(null)} />
      <ConfirmDialog
        open={!!confirm}
        title={confirm ? CONFIRM[confirm.action].title : ''}
        description={confirm ? CONFIRM[confirm.action].text(confirm.row) : ''}
        confirmLabel={confirm ? CONFIRM[confirm.action].label : 'Confirm'}
        destructive={confirm?.action === 'cancel'}
        onConfirm={runConfirmed}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
