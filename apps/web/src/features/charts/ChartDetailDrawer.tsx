'use client';
import * as React from 'react';
import Link from 'next/link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { AuditEntry, ProductionEntry, Role } from '@smartcode/types';
import { Button, DataTable, Drawer, ErrorState, LoadingState, StatusBadge } from '@smartcode/ui';
import { formatDate, personName } from '@/lib/format';
import { AuditStateBadge } from '@/features/audits/AuditStateBadge';
import { ResolveAuditDialog } from '@/features/audits/ResolveAuditDialog';
import { useChartDetail } from './use-charts';

/** Chart detail: current state, every production version, and every audit (re-audits included). */
export function ChartDetailDrawer({ chartId, role, onClose }: { chartId: string | null; role: Role; onClose: () => void }) {
  const { data, isLoading, isError, refetch } = useChartDetail(chartId);
  const [resolveTarget, setResolveTarget] = React.useState<AuditEntry | null>(null);
  const canResolve = role === 'TEAM_LEAD' || role === 'MANAGER';

  return (
    <Drawer open={!!chartId} onClose={onClose} title={chartId ? `Chart ${chartId}` : 'Chart'} width={760}>
      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState onRetry={() => refetch()} description="Could not load this chart." />
      ) : (
        <Stack spacing={3}>
          <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
            <Typography variant="body2">
              Project: <strong>{data.project?.name ?? '—'}</strong>
              {data.project?.client ? ` (${data.project.client.name})` : ''}
            </Typography>
            <Typography variant="body2">
              Team: <strong>{data.teamName ?? '—'}</strong>
            </Typography>
            <Typography variant="body2">
              Current version: <strong>{data.currentVersion ?? '—'}</strong>
            </Typography>
            {data.productionStatus && <StatusBadge status={data.productionStatus} />}
            {role !== 'CODER' && <AuditStateBadge state={data.auditState} />}
            {data.isRework && <Typography variant="body2" color="warning.main">Rework history</Typography>}
          </Stack>
          {role === 'AUDITOR' && (
            <div>
              <Button component={Link} href={`/auditor/audit-entry?chartId=${encodeURIComponent(data.chartId)}`} size="small">
                Open in Audit Entry
              </Button>
            </div>
          )}

          <div>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              Production history
            </Typography>
            <DataTable<ProductionEntry>
              rows={data.productionHistory}
              rowKey={(p) => p.id}
              emptyTitle="No production recorded"
              columns={[
                { key: 'version', header: 'Version', render: (p) => `v${p.version}${p.isCurrent ? ' (current)' : ''}` },
                { key: 'coder', header: 'Coder', render: (p) => `${personName(p.coder)} (${p.coder.employeeId})` },
                { key: 'pages', header: 'Pages', align: 'right', render: (p) => p.pageCount },
                { key: 'icds', header: 'ICDs', align: 'right', render: (p) => p.totalICDs },
                { key: 'dos', header: 'DOS', align: 'right', render: (p) => p.totalDOS },
                { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
                { key: 'codedDate', header: 'Coded', render: (p) => formatDate(p.codedDate) },
              ]}
            />
          </div>

          {role !== 'CODER' && (
            <div>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                Audit history
              </Typography>
              <DataTable<AuditEntry>
                rows={data.auditHistory}
                rowKey={(a) => a.id}
                emptyTitle="Not audited yet"
                columns={[
                  { key: 'version', header: 'Prod. ver.', render: (a) => `v${a.productionVersion}` },
                  { key: 'auditor', header: 'Auditor', render: (a) => personName(a.auditor) },
                  { key: 'errors', header: 'Errors + Exceptions = Total', render: (a) => `${a.auditErrors} + ${a.errorExceptions} = ${a.totalErrors}` },
                  { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
                  { key: 'auditDate', header: 'Audit Date', render: (a) => formatDate(a.auditDate) },
                  {
                    key: 'actions',
                    header: '',
                    align: 'right',
                    render: (a) =>
                      canResolve && a.status === 'REVIEW_REQUIRED' ? (
                        <Button size="small" variant="outlined" onClick={() => setResolveTarget(a)}>
                          Resolve
                        </Button>
                      ) : null,
                  },
                ]}
              />
            </div>
          )}
        </Stack>
      )}
      <ResolveAuditDialog audit={resolveTarget} onClose={() => setResolveTarget(null)} />
    </Drawer>
  );
}
