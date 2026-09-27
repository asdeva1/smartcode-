'use client';
import * as React from 'react';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import { RefreshCw } from 'lucide-react';
import type { ChartSummary, Role } from '@smartcode/types';
import { Button, DataTable, ErrorState, FilterBar, Input, Pagination, Select, StatusBadge } from '@smartcode/ui';
import { ExportMenu } from '@/components/data/ExportMenu';
import { AUDIT_STATUS_OPTIONS, PRODUCTION_STATUS_OPTIONS, formatDate, personName } from '@/lib/format';
import { AuditStateBadge } from '@/features/audits/AuditStateBadge';
import { useCharts } from './use-charts';
import { ChartDetailDrawer } from './ChartDetailDrawer';

const PAGE_SIZE = 25;

/**
 * Chart Repository - one row per Chart ID with its current production and
 * audit state. Rows are scoped by the API (Manager all, Team Lead team
 * projects, Coder own charts, Auditor assigned projects).
 */
export function ChartRepository({ role }: { role: Role }) {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [productionStatus, setProductionStatus] = React.useState('');
  const [auditState, setAuditState] = React.useState('');
  const [rework, setRework] = React.useState(false);
  const [openChart, setOpenChart] = React.useState<string | null>(null);

  const filters = {
    search: search || undefined,
    productionStatus: productionStatus || undefined,
    auditState: role === 'CODER' ? undefined : auditState || undefined,
    rework: rework ? ('yes' as const) : undefined,
  };
  const { data, isLoading, isError, refetch, isFetching } = useCharts({ page, pageSize: PAGE_SIZE, ...filters });
  const filter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  return (
    <>
      <FilterBar>
        <Input label="Search Chart ID" value={search} onChange={(e) => filter(() => setSearch(e.target.value))} sx={{ minWidth: 200 }} />
        <Select
          label="Production status"
          value={productionStatus}
          onChange={(e) => filter(() => setProductionStatus(e.target.value))}
          options={PRODUCTION_STATUS_OPTIONS}
          sx={{ minWidth: 170 }}
        />
        {role !== 'CODER' && (
          <Select
            label="Audit status"
            value={auditState}
            onChange={(e) => filter(() => setAuditState(e.target.value))}
            options={[AUDIT_STATUS_OPTIONS[0], { value: 'NOT_AUDITED', label: 'Not audited' }, ...AUDIT_STATUS_OPTIONS.slice(1)]}
            sx={{ minWidth: 170 }}
          />
        )}
        <Button variant={rework ? 'contained' : 'outlined'} size="small" onClick={() => filter(() => setRework(!rework))} aria-pressed={rework}>
          Rework only
        </Button>
        <IconButton onClick={() => refetch()} aria-label="Refresh" disabled={isFetching}>
          <RefreshCw size={18} />
        </IconButton>
        <ExportMenu path="/charts/export" params={filters} />
      </FilterBar>

      {isError ? (
        <ErrorState onRetry={() => refetch()} description="Could not load charts. Please try again." />
      ) : (
        <>
          <DataTable<ChartSummary>
            isLoading={isLoading}
            rows={data?.data ?? []}
            rowKey={(c) => c.chartId}
            onRowClick={(c) => setOpenChart(c.chartId)}
            emptyTitle="No charts found"
            emptyDescription="Charts appear here once production is entered against them."
            columns={[
              { key: 'chartId', header: 'Chart ID', render: (c) => c.chartId },
              { key: 'project', header: 'Project', render: (c) => c.project?.name ?? '—' },
              ...(role === 'MANAGER' ? [{ key: 'team', header: 'Team', render: (c: ChartSummary) => c.teamName ?? '—' }] : []),
              { key: 'version', header: 'Ver.', align: 'right', render: (c) => c.currentVersion ?? '—' },
              ...(role === 'CODER' ? [] : [{ key: 'coder', header: 'Coder', render: (c: ChartSummary) => personName(c.coder) }]),
              { key: 'productionStatus', header: 'Production', render: (c) => (c.productionStatus ? <StatusBadge status={c.productionStatus} /> : '—') },
              ...(role === 'CODER'
                ? []
                : [
                    { key: 'auditState', header: 'Audit', render: (c: ChartSummary) => <AuditStateBadge state={c.auditState} /> },
                    { key: 'errors', header: 'Total Errors', align: 'right' as const, render: (c: ChartSummary) => c.latestTotalErrors ?? '—' },
                  ]),
              { key: 'codedDate', header: 'Coded Date', render: (c) => formatDate(c.codedDate) },
              { key: 'rework', header: 'Rework', render: (c) => (c.isRework ? <Chip size="small" color="warning" variant="outlined" label="Rework" /> : '—') },
            ]}
          />
          {data && data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
        </>
      )}

      <ChartDetailDrawer chartId={openChart} role={role} onClose={() => setOpenChart(null)} />
    </>
  );
}
