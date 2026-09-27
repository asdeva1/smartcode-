'use client';
import * as React from 'react';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { REPORT_TITLES, type ReportKey, type ReportResponse } from '@smartcode/types';
import { DataTable, DatePicker, ErrorState, FilterBar, Select } from '@smartcode/ui';
import { apiFetch, toQuery } from '@/lib/api-client';
import { ExportMenu } from './ExportMenu';

/**
 * Runs one of the caller's role-permitted reports with an optional date
 * range, shows it as a table, and exports the same report (same filters)
 * as PDF / Excel / CSV from the backend.
 */
export function ReportsView({ reports, initial }: { reports: ReportKey[]; initial?: ReportKey }) {
  const [report, setReport] = React.useState<ReportKey>(initial ?? reports[0]);
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const params = { from: from || undefined, to: to || undefined };

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['reports', report, params],
    queryFn: () => apiFetch<ReportResponse>(`/reports/${report}?${toQuery(params)}`),
  });

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
        <DatePicker label="From" value={from} onChange={(e) => setFrom(e.target.value)} sx={{ maxWidth: 170 }} />
        <DatePicker label="To" value={to} onChange={(e) => setTo(e.target.value)} sx={{ maxWidth: 170 }} />
        <IconButton onClick={() => refetch()} aria-label="Refresh" disabled={isFetching}>
          <RefreshCw size={18} />
        </IconButton>
        <ExportMenu path={`/reports/${report}/export`} params={params} disabled={isLoading || isError} />
      </FilterBar>

      {isError ? (
        <ErrorState onRetry={() => refetch()} description="Could not load this report." />
      ) : (
        <>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
            {REPORT_TITLES[report]}
          </Typography>
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
        </>
      )}
    </>
  );
}
