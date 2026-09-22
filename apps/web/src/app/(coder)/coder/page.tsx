'use client';
import Grid from '@mui/material/Grid';
import { PageHeader, MetricCard } from '@smartcode/ui';

export default function CoderDashboardPage() {
  return (
    <>
      <PageHeader title="My Dashboard" description="Your production overview" />
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard label="My Production Today" value="—" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard label="Pending Rework" value="—" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard label="Completed This Week" value="—" />
        </Grid>
      </Grid>
    </>
  );
}
