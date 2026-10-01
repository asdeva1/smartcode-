'use client';
import * as React from 'react';
import { Alert, Button, DataTable, FilterBar, Input, MetricCard, Pagination, Select, useToast } from '@smartcode/ui';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import type { ChartAllocationListRow } from '@smartcode/types';
import { useMyProjects } from '@/features/production/use-production';
import { formatDate, personName } from '@/lib/format';
import {
  useChartAllocationHistory,
  useChartAllocationList,
  useChartAllocationMetrics,
  useExportChartAllocationSummary,
  usePullbackChartAllocation,
  useReassignChartAllocation,
} from './use-chart-allocation';

const PAGE_SIZE = 25;

/**
 * Manager Chart Allocation workspace (docs/09-BUSINESS-RULES.md section 12,
 * Phase 10D). A SEPARATE workspace from features/charts/ChartRepository -
 * that component is untouched; this one is rendered as its own tab on the
 * Manager Charts page (see app/(manager)/manager/charts/page.tsx).
 *
 * The Manager can browse/filter a MANUAL project's charts, export the
 * Summary workbook/CSV for a Team Lead to fill in and re-upload, and
 * pull back or reassign an existing allocation. The Manager does NOT get a
 * manual per-chart "assign" form - only Team Lead Summary upload creates
 * new allocations, per this phase's business rules.
 */
export function ChartAllocationWorkspace() {
  const { showToast } = useToast();
  const { data: projects } = useMyProjects();
  const [projectId, setProjectId] = React.useState<string>('');
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [allocated, setAllocated] = React.useState<'all' | 'allocated' | 'unallocated'>('all');
  const [reassignTarget, setReassignTarget] = React.useState<ChartAllocationListRow | null>(null);
  const [reassignLoginName, setReassignLoginName] = React.useState('');

  const list = useChartAllocationList(projectId || null, { page, pageSize: PAGE_SIZE, search: search || undefined, allocated });
  const metrics = useChartAllocationMetrics(projectId || null);
  const history = useChartAllocationHistory(projectId || null, { page: 1, pageSize: 10 });
  const exportSummary = useExportChartAllocationSummary();
  const pullback = usePullbackChartAllocation();
  const reassign = useReassignChartAllocation();

  const notManualError = list.isError && String((list.error as any)?.message ?? '').match(/MANUAL allocation/);

  const filter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    if (!projectId) return;
    try {
      await exportSummary.mutateAsync({ projectId, format, search: search || undefined, allocated });
      showToast('Summary export downloaded', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Export failed', 'error');
    }
  };

  const handlePullback = async (row: ChartAllocationListRow) => {
    if (!projectId) return;
    try {
      await pullback.mutateAsync({ projectId, chartId: row.chartId, input: {} });
      showToast(`Chart ${row.chartId} pulled back`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Pullback failed', 'error');
    }
  };

  const submitReassign = async () => {
    if (!projectId || !reassignTarget || !reassignLoginName.trim()) return;
    try {
      await reassign.mutateAsync({ projectId, chartId: reassignTarget.chartId, input: { loginName: reassignLoginName.trim() } });
      showToast(`Chart ${reassignTarget.chartId} reassigned`, 'success');
      setReassignTarget(null);
      setReassignLoginName('');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Reassign failed', 'error');
    }
  };

  return (
    <Stack spacing={2}>
      <FilterBar>
        <Select
          label="Project"
          value={projectId}
          onChange={(e) => filter(() => setProjectId(e.target.value))}
          options={[{ value: '', label: 'Select a project…' }, ...(projects ?? []).map((p) => ({ value: p.id, label: p.name }))]}
          sx={{ minWidth: 240 }}
        />
        <Input label="Search Chart ID" value={search} onChange={(e) => filter(() => setSearch(e.target.value))} sx={{ minWidth: 200 }} />
        <Select
          label="Allocation status"
          value={allocated}
          onChange={(e) => filter(() => setAllocated(e.target.value as typeof allocated))}
          options={[
            { value: 'all', label: 'All' },
            { value: 'allocated', label: 'Allocated' },
            { value: 'unallocated', label: 'Unallocated' },
          ]}
          sx={{ minWidth: 170 }}
        />
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" disabled={!projectId} onClick={() => handleExport('csv')}>
          Export Summary (CSV)
        </Button>
        <Button variant="outlined" disabled={!projectId} onClick={() => handleExport('xlsx')}>
          Export Summary (Excel)
        </Button>
      </FilterBar>

      {!projectId && <Alert severity="info">Select a MANUAL allocation project to view and export its Chart Allocation workspace.</Alert>}
      {notManualError && <Alert severity="warning">Chart allocation is available only for MANUAL allocation projects.</Alert>}

      {projectId && !notManualError && (
        <>
          {metrics.data && (
            <Stack direction="row" spacing={2}>
              <MetricCard label="Charts Allocated" value={metrics.data.allocated} />
              <MetricCard label="Charts Done" value={metrics.data.done} />
              <MetricCard label="Charts Pending" value={metrics.data.pending} />
            </Stack>
          )}

          <DataTable<ChartAllocationListRow>
            rows={list.data?.data ?? []}
            rowKey={(r) => r.chartId}
            isLoading={list.isLoading}
            emptyTitle="No charts found"
            columns={[
              { key: 'chartId', header: 'Chart ID', render: (r) => r.chartId },
              { key: 'pageCount', header: 'Page Count', render: (r) => r.pageCount ?? '—' },
              { key: 'highLevelStatus', header: 'Status', render: (r) => r.highLevelStatus ?? '—' },
              { key: 'assignedCoder', header: 'Assigned to', render: (r) => (r.assignedCoder ? personName(r.assignedCoder) : '—') },
              { key: 'assignedAt', header: 'Assigned at', render: (r) => (r.assignedAt ? formatDate(r.assignedAt) : '—') },
              { key: 'productionStatus', header: 'Production', render: (r) => r.productionStatus ?? '—' },
              {
                key: 'actions',
                header: 'Actions',
                render: (r) =>
                  r.assignedCoder ? (
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="outlined" onClick={() => setReassignTarget(r)}>
                        Reassign
                      </Button>
                      <Button size="small" variant="outlined" color="error" onClick={() => handlePullback(r)}>
                        Pull back
                      </Button>
                    </Stack>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} />

          {reassignTarget && (
            <Alert severity="info" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span>Reassign chart {reassignTarget.chartId} to Login Name:</span>
              <Input value={reassignLoginName} onChange={(e) => setReassignLoginName(e.target.value)} size="small" />
              <Button size="small" onClick={submitReassign} disabled={!reassignLoginName.trim()}>
                Confirm
              </Button>
              <Button size="small" variant="outlined" onClick={() => setReassignTarget(null)}>
                Cancel
              </Button>
            </Alert>
          )}

          {history.data && history.data.data.length > 0 && (
            <>
              <h3 style={{ margin: '8px 0 0' }}>Recent allocation history</h3>
              <DataTable
                rows={history.data.data}
                rowKey={(r) => r.id}
                columns={[
                  { key: 'chartId', header: 'Chart ID', render: (r) => r.chartId },
                  { key: 'coder', header: 'Coder', render: (r) => personName(r.coder) },
                  { key: 'assignedAt', header: 'Assigned at', render: (r) => formatDate(r.assignedAt) },
                  { key: 'isActive', header: 'Status', render: (r) => (r.isActive ? 'Active' : (r.endReason ?? 'Ended')) },
                ]}
              />
            </>
          )}
        </>
      )}
    </Stack>
  );
}
