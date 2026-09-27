'use client';
import * as React from 'react';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { ErrorState, LoadingState, MetricCard } from '@smartcode/ui';
import { formatDate } from '@/lib/format';
import { useVendorDashboard } from './use-vendors';

/** One vendor's dashboard figures (Manager: any vendor by id; Vendor: its own, id = null). */
export function VendorMetrics({ vendorId }: { vendorId: string | null }) {
  const { data, isLoading, isError, refetch } = useVendorDashboard(vendorId);
  if (isLoading) return <LoadingState label="Loading vendor dashboard..." />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} description="Could not load vendor figures." />;
  return (
    <>
      {data.period && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
          Current period (this month): {formatDate(data.period.from)} - {formatDate(data.period.to)}
        </Typography>
      )}
      <Grid container spacing={2}>
        {data.metrics.map((m) => (
          <Grid item xs={12} sm={6} md={3} key={m.key}>
            <MetricCard label={m.label} value={m.value.toLocaleString()} />
          </Grid>
        ))}
      </Grid>
    </>
  );
}
