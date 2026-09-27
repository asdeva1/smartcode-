'use client';
import * as React from 'react';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  GROUPABLE_REPORTS,
  REPORT_FAMILY_INFO,
  REPORT_FAMILY_OF,
  REPORT_GROUPINGS,
  REPORT_GROUPING_LABELS,
  REPORT_PERIODS,
  REPORT_PERIOD_LABELS,
  REPORT_TITLES,
  ROLE_LABELS,
  resolvePeriod,
  type ReportFilterKey,
  type ReportGrouping,
  type ReportKey,
  type ReportPeriod,
  type ReportResponse,
  type Role,
} from '@smartcode/types';
import { DataTable, DatePicker, ErrorState, FilterBar, Select } from '@smartcode/ui';
import { apiFetch, toQuery } from '@/lib/api-client';
import { todayLocal } from '@/lib/format';
import { ExportMenu } from './ExportMenu';
import { ReportFilters, type ReportFilterValues } from './ReportFilters';

/**
 * Runs one of the caller's role-permitted reports and exports the same
 * report (same filters) as PDF / Excel / CSV from the backend.
 *
 * Period: "All time" (default) or a named period (Today ... This Year),
 * resolved by the shared @smartcode/types period utility against the
 * user's LOCAL calendar date - the same utility the API uses, so the
 * range shown here is exactly the range the server applies. "Custom" and
 * "All time" allow free From/To dates.
 */
export function ReportsView({ reports, initial, role }: { reports: ReportKey[]; initial?: ReportKey; role?: Role }) {
  const [report, setReport] = React.useState<ReportKey>(initial ?? reports[0]);
  const [period, setPeriod] = React.useState<ReportPeriod | ''>('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [groupBy, setGroupBy] = React.useState<ReportGrouping | ''>('');
  const [filters, setFilters] = React.useState<ReportFilterValues>({});
  const today = todayLocal();
  const named = period !== '' && period !== 'custom';
  const resolved = named ? resolvePeriod(period, today) : null;
  const groupable = GROUPABLE_REPORTS.includes(report);

  const params: Record<string, string | undefined> = {
    from: named ? undefined : from || undefined,
    to: named ? undefined : to || undefined,
    ...(period ? { period, today } : {}),
    groupBy: groupable && groupBy ? groupBy : undefined,
    ...Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, v || undefined])),
  };
  // A custom period needs both ends before it can run.
  const incomplete = period === 'custom' && (!from || !to);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['reports', report, params],
    queryFn: () => apiFetch<ReportResponse>(`/reports/${report}?${toQuery(params)}`),
    enabled: !incomplete,
  });
  const family = REPORT_FAMILY_INFO[REPORT_FAMILY_OF[report]];

  return (
    <>
      <FilterBar>
        {reports.length > 1 && (
          <Select
            label="Report"
            value={report}
            onChange={(e) => setReport(e.target.value as ReportKey)}
            options={reports.map((r) => ({ value: r, label: REPORT_TITLES[r] }))}
            sx={{ minWidth: 240 }}
          />
        )}
        <Select
          label="Period"
          value={period}
          onChange={(e) => setPeriod(e.target.value as ReportPeriod | '')}
          options={[{ value: '', label: 'All time' }, ...REPORT_PERIODS.map((p) => ({ value: p, label: REPORT_PERIOD_LABELS[p] }))]}
          sx={{ minWidth: 180 }}
        />
        <DatePicker
          label="From"
          value={resolved ? resolved.from : from}
          onChange={(e) => setFrom(e.target.value)}
          disabled={named}
          error={period === 'custom' && !from}
          sx={{ maxWidth: 170 }}
        />
        <DatePicker
          label="To"
          value={resolved ? resolved.to : to}
          onChange={(e) => setTo(e.target.value)}
          disabled={named}
          error={period === 'custom' && !to}
          sx={{ maxWidth: 170 }}
        />
        {groupable && (
          <Select
            label="Group by"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as ReportGrouping | '')}
            options={[{ value: '', label: 'No grouping' }, ...REPORT_GROUPINGS.map((g) => ({ value: g, label: REPORT_GROUPING_LABELS[g] }))]}
            sx={{ minWidth: 170 }}
          />
        )}
        {role && <ReportFilters role={role} values={filters} onChange={(k: ReportFilterKey, v: string) => setFilters((f) => ({ ...f, [k]: v }))} />}
        <IconButton onClick={() => refetch()} aria-label="Refresh" disabled={isFetching || incomplete}>
          <RefreshCw size={18} />
        </IconButton>
        <ExportMenu path={`/reports/${report}/export`} params={params} disabled={isLoading || isError || incomplete} />
      </FilterBar>

      {isError ? (
        <ErrorState onRetry={() => refetch()} description="Could not load this report." />
      ) : (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ mb: 1 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              {REPORT_TITLES[report]}
            </Typography>
            <Chip size="small" variant="outlined" label={family.title} />
            <Typography variant="caption" color="text.secondary">
              Owner: {ROLE_LABELS[family.owner]}
              {role && role === family.owner ? ' (you)' : ''}
            </Typography>
          </Stack>
          {incomplete ? (
            <Typography variant="body2" color="text.secondary">
              Choose both a From and a To date for a custom range.
            </Typography>
          ) : (
            <DataTable<Record<string, unknown>>
              isLoading={isLoading}
              rows={data?.rows ?? []}
              rowKey={(row) => JSON.stringify(row)}
              emptyTitle="No data for this report"
              emptyDescription="Try a wider date range."
              columns={(data?.columns ?? []).map((c) => ({
                key: c.key,
                header: c.label,
                align: c.numeric ? ('right' as const) : undefined,
                render: (r) => {
                  const v = r[c.key];
                  return v === null || v === undefined || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString() : String(v);
                },
              }))}
            />
          )}
        </>
      )}
    </>
  );
}
