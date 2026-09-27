'use client';
import * as React from 'react';
import Link from 'next/link';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import { RefreshCw } from 'lucide-react';
import type { AuditQueueItem } from '@smartcode/types';
import { Button, DataTable, ErrorState, FilterBar, Input, Pagination, Select, StatusBadge } from '@smartcode/ui';
import { ExportMenu } from '@/components/data/ExportMenu';
import { useMyProjects } from '@/features/production/use-production';
import { formatDate, personName } from '@/lib/format';
import { useAuditQueue } from './use-audits';

const PAGE_SIZE = 25;

/** Charts in the Auditor's assigned projects awaiting audit, plus their own in-progress audits. */
export function AuditQueue() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [projectId, setProjectId] = React.useState('');
  const [state, setState] = React.useState<'all' | 'pending' | 'in_progress'>('all');
  const projects = useMyProjects();
  const filters = { search: search || undefined, projectId: projectId || undefined, state };
  const { data, isLoading, isError, refetch, isFetching } = useAuditQueue({ page, pageSize: PAGE_SIZE, ...filters });
  const filter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  return (
    <>
      <FilterBar>
        <Input label="Search Chart ID" value={search} onChange={(e) => filter(() => setSearch(e.target.value))} sx={{ minWidth: 200 }} />
        <Select
          label="Project"
          value={projectId}
          onChange={(e) => filter(() => setProjectId(e.target.value))}
          options={[{ value: '', label: 'All assigned projects' }, ...(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))]}
          sx={{ minWidth: 200 }}
        />
        <Select
          label="Queue"
          value={state}
          onChange={(e) => filter(() => setState(e.target.value as typeof state))}
          options={[
            { value: 'all', label: 'Pending + my in-progress' },
            { value: 'pending', label: 'Pending audit' },
            { value: 'in_progress', label: 'My in-progress audits' },
          ]}
          sx={{ minWidth: 220 }}
        />
        <IconButton onClick={() => refetch()} aria-label="Refresh" disabled={isFetching}>
          <RefreshCw size={18} />
        </IconButton>
        <ExportMenu path="/auditor/queue/export" params={filters} />
      </FilterBar>

      {isError ? (
        <ErrorState onRetry={() => refetch()} description="Could not load the audit queue. Please try again." />
      ) : (
        <>
          <DataTable<AuditQueueItem>
            isLoading={isLoading}
            rows={data?.data ?? []}
            rowKey={(r) => r.chartId}
            emptyTitle="Nothing to audit"
            emptyDescription="Charts from your assigned projects appear here when their production is completed."
            columns={[
              { key: 'chartId', header: 'Chart ID', render: (r) => r.chartId },
              { key: 'project', header: 'Project', render: (r) => r.project?.name ?? '—' },
              { key: 'coder', header: 'Coder', render: (r) => `${personName(r.coder)} (${r.coder.employeeId})` },
              { key: 'pages', header: 'Pages', align: 'right', render: (r) => r.pageCount },
              { key: 'icds', header: 'ICDs', align: 'right', render: (r) => r.totalICDs },
              { key: 'dos', header: 'DOS', align: 'right', render: (r) => r.totalDOS },
              { key: 'codedDate', header: 'Coded Date', render: (r) => formatDate(r.codedDate) },
              { key: 'production', header: 'Production', render: (r) => <StatusBadge status={r.productionStatus} /> },
              {
                key: 'state',
                header: 'Audit',
                render: (r) => (
                  <>
                    <Chip size="small" variant="outlined" color={r.queueState === 'IN_PROGRESS' ? 'info' : 'default'} label={r.queueState === 'IN_PROGRESS' ? 'In progress' : 'Pending'} />
                    {r.isReaudit && <Chip size="small" color="warning" variant="outlined" label="Re-audit" sx={{ ml: 0.5 }} />}
                    {r.rework?.status === 'RESOLVED' && (
                      <Chip size="small" color="info" label="Rework resolved" title={`Rework reason: ${r.rework.reason}`} sx={{ ml: 0.5 }} />
                    )}
                  </>
                ),
              },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: (r) => (
                  <Button size="small" component={Link} href={`/auditor/audit-entry?chartId=${encodeURIComponent(r.chartId)}`}>
                    {r.queueState === 'IN_PROGRESS' ? 'Continue' : 'Audit'}
                  </Button>
                ),
              },
            ]}
          />
          {data && data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
        </>
      )}
    </>
  );
}
