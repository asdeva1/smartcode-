'use client';
import * as React from 'react';
import Link from 'next/link';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { Role, Rework } from '@smartcode/types';
import { Alert, Button, Drawer, ErrorState, LoadingState, StatusBadge } from '@smartcode/ui';
import { errorMessage, formatDate, formatDateTime, personName } from '@/lib/format';
import { ReworkStatusChip } from './ReworkStatusChip';
import { useMarkReworkRead, useReworkItem } from './use-rework';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ py: 0.5 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600} component="div" textAlign="right">
        {children}
      </Typography>
    </Stack>
  );
}

/**
 * Full rework item. Opening it marks the caller's own notifications for
 * it as read (server-side, own notifications only).
 */
export function ReworkDetailDrawer({
  id,
  role,
  onClose,
  onResolve,
}: {
  id: string | null;
  role: Role;
  onClose: () => void;
  onResolve?: (r: Rework) => void;
}) {
  const item = useReworkItem(id);
  const markRead = useMarkReworkRead();
  const markedFor = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (item.data?.unread && markedFor.current !== item.data.id) {
      markedFor.current = item.data.id;
      markRead.mutate(item.data.id);
    }
  }, [item.data, markRead]);

  if (!id) return null;
  const r = item.data;
  return (
    <Drawer open={!!id} onClose={onClose} title={r ? `Rework - ${r.chartId}` : 'Rework'} width={460}>
      {item.isLoading && <LoadingState />}
      {item.isError && <ErrorState title="Rework not available" description={errorMessage(item.error, 'Could not load this rework.')} onRetry={() => item.refetch()} />}
      {r && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <ReworkStatusChip status={r.status} />
          </Stack>
          <Alert severity={r.status === 'OPEN' || r.status === 'IN_PROGRESS' ? 'warning' : 'info'}>
            <strong>Reason:</strong> {r.reason}
          </Alert>
          {r.resolutionNote && (
            <Alert severity="success">
              <strong>Resolution:</strong> {r.resolutionNote}
            </Alert>
          )}
          <div>
            <Row label="Chart ID">{r.chartId}</Row>
            <Row label="Project">{r.project?.name ?? '—'}</Row>
            <Row label="Team">{r.team?.name ?? '—'}</Row>
            <Row label="Coder">{`${personName(r.coder)} (${r.coder.employeeId})`}</Row>
            <Row label="Team Lead">{personName(r.teamLead)}</Row>
            <Row label="Auditor">{personName(r.auditor)}</Row>
          </div>
          <Divider />
          <div>
            <Row label="Requested">{formatDateTime(r.createdAt)}</Row>
            <Row label="Audit">
              <StatusBadge status={r.audit.status} /> {formatDate(r.audit.auditDate)} - {r.audit.totalErrors} error(s)
            </Row>
            <Row label="Audited version">{`v${r.originalProduction.version} - ${r.originalProduction.pageCount} pages, ${r.originalProduction.totalICDs} ICDs, ${r.originalProduction.totalDOS} DOS`}</Row>
            <Row label="Corrected version">
              {r.reworkProduction ? (
                <>
                  v{r.reworkProduction.version} <StatusBadge status={r.reworkProduction.status} />
                </>
              ) : (
                'Not started'
              )}
            </Row>
            <Row label="Resolved">{r.resolvedAt ? `${formatDateTime(r.resolvedAt)} by ${personName(r.resolvedBy)}` : '—'}</Row>
            <Row label="Re-audited">{formatDateTime(r.reauditedAt)}</Row>
          </div>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            {role === 'CODER' && (r.status === 'OPEN' || r.status === 'IN_PROGRESS') && onResolve && (
              <Button onClick={() => onResolve(r)}>Resolve rework</Button>
            )}
            {role === 'AUDITOR' && r.status === 'RESOLVED' && (
              <Button component={Link} href={`/auditor/audit-entry?chartId=${encodeURIComponent(r.chartId)}`}>
                Re-audit
              </Button>
            )}
          </Stack>
        </Stack>
      )}
    </Drawer>
  );
}
