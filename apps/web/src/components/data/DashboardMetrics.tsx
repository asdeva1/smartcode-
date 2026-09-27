'use client';
import * as React from 'react';
import Grid from '@mui/material/Grid';
import { useQuery } from '@tanstack/react-query';
import type { DashboardSummary } from '@smartcode/types';
import { ErrorState, LoadingState, MetricCard } from '@smartcode/ui';
import { apiFetch } from '@/lib/api-client';
import { todayLocal } from '@/lib/format';

/** Role-specific metrics computed by the backend from real data - never placeholder numbers. */
export function DashboardMetrics() {
  const today = todayLocal();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard', 'summary', today],
    queryFn: () => apiFetch<DashboardSummary>(`/reports/dashboard?today=${today}`),
  });

  if (isLoading) return <LoadingState label="Loading dashboard..." />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} description="Could not load dashboard figures." />;

  return (
    <Grid container spacing={2}>
      {data.metrics.map((m) => (
        <Grid item xs={12} sm={6} md={3} key={m.key}>
          <MetricCard label={m.label} value={m.value.toLocaleString()} />
        </Grid>
      ))}
    </Grid>
  );
}
