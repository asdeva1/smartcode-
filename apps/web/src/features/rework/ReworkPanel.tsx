'use client';
import * as React from 'react';
import Link from 'next/link';
import Badge from '@mui/material/Badge';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { RotateCcw } from 'lucide-react';
import type { Role } from '@smartcode/types';
import { Button, DataTable, ErrorState, LoadingState } from '@smartcode/ui';
import { formatDateTime, personName } from '@/lib/format';
import { ReworkStatusChip } from './ReworkStatusChip';
import { useReworkSummary } from './use-rework';

const ROLE_BASE: Record<Role, string> = {
  MANAGER: '/manager',
  TEAM_LEAD: '/team-lead',
  CODER: '/coder',
  AUDITOR: '/auditor',
  VENDOR: '/vendor',
};

/**
 * Dashboard rework alert for Team Lead / Coder / Auditor / Vendor. Reads
 * GET /rework/summary only - refreshing never creates or duplicates
 * notifications. Unread items are highlighted until opened.
 */
export function ReworkPanel({ role }: { role: Role }) {
  const { data, isLoading, isError, refetch } = useReworkSummary();
  const base = ROLE_BASE[role];
  const pending = (data?.open ?? 0) + (data?.inProgress ?? 0);
  const href = (id?: string) => `${base}/rework${id ? `?open=${encodeURIComponent(id)}` : ''}`;

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2, borderLeft: pending > 0 ? '4px solid' : undefined, borderLeftColor: 'error.main' }} component="section" aria-label="Rework">
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1} sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Badge color="error" badgeContent={data?.unread ?? 0} aria-label={`${data?.unread ?? 0} unread rework notifications`}>
            <RotateCcw size={20} />
          </Badge>
          <Typography variant="subtitle1" fontWeight={700}>
            Rework
          </Typography>
          {data && (
            <>
              <Chip size="small" color={pending > 0 ? 'error' : 'default'} label={`${pending} pending`} />
              <Chip size="small" color="info" variant="outlined" label={`${data.resolved} awaiting re-audit`} />
              {data.unread > 0 && <Chip size="small" color="error" variant="outlined" label={`${data.unread} new`} />}
            </>
          )}
        </Stack>
        <Button size="small" variant="outlined" component={Link} href={href()}>
          View all rework
        </Button>
      </Stack>
      {isLoading ? (
        <LoadingState label="Loading rework..." />
      ) : isError || !data ? (
        <ErrorState onRetry={() => refetch()} description="Could not load rework." />
      ) : (
        <DataTable
          rows={data.recent}
          rowKey={(r) => r.id}
          emptyTitle="No rework"
          emptyDescription="Charts sent back by an Auditor will appear here."
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
            ...(role === 'CODER' ? [] : [{ key: 'coder', header: 'Coder', render: (r: (typeof data.recent)[number]) => personName(r.coder) }]),
            { key: 'reason', header: 'Rework reason', render: (r) => r.reason },
            { key: 'when', header: 'Date / time', render: (r) => formatDateTime(r.resolvedAt ?? r.createdAt) },
            { key: 'status', header: 'Status', render: (r) => <ReworkStatusChip status={r.status} /> },
            {
              key: 'open',
              header: '',
              align: 'right',
              render: (r) => (
                <Button size="small" variant="text" component={Link} href={href(r.id)} aria-label={`Open rework for ${r.chartId}`}>
                  {role === 'CODER' && (r.status === 'OPEN' || r.status === 'IN_PROGRESS') ? 'Open & resolve' : 'Open'}
                </Button>
              ),
            },
          ]}
        />
      )}
    </Paper>
  );
}
