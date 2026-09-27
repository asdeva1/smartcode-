'use client';
import * as React from 'react';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Drawer, ErrorState, LoadingState, MetricCard } from '@smartcode/ui';
import { formatDate } from '@/lib/format';
import { useCoder } from './use-coders';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Stack direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={500}>
        {value}
      </Typography>
    </Stack>
  );
}

/** "View coder": account details plus current production counts. */
export function CoderDetailDrawer({ coderId, onClose }: { coderId: string | null; onClose: () => void }) {
  const { data, isLoading, isError, refetch } = useCoder(coderId);
  return (
    <Drawer open={!!coderId} onClose={onClose} title="Coder details" width={460}>
      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState onRetry={() => refetch()} description="Could not load this Coder." />
      ) : (
        <Stack spacing={2}>
          <div>
            <Field label="Full Name" value={data.fullName ?? '—'} />
            <Field label="Employee ID" value={data.employeeId} />
            <Field label="Login Name" value={data.loginName} />
            <Field label="Email" value={data.email} />
            <Field label="Status" value={data.isActive ? 'Active' : 'Inactive'} />
            <Field label="Created" value={formatDate(data.createdAt)} />
            <Field label="Last Login" value={data.lastLoginAt ? new Date(data.lastLoginAt).toLocaleString() : 'Never'} />
          </div>
          <Typography variant="subtitle2">Current production</Typography>
          <Grid container spacing={1}>
            {[
              ['Charts', data.stats.charts],
              ['Completed', data.stats.completed],
              ['In Progress', data.stats.inProgress],
              ['Rework', data.stats.rework],
              ['Pages', data.stats.pages],
              ['Total ICDs', data.stats.icds],
            ].map(([label, value]) => (
              <Grid item xs={6} key={label as string}>
                <MetricCard label={label as string} value={value as number} />
              </Grid>
            ))}
          </Grid>
        </Stack>
      )}
    </Drawer>
  );
}
