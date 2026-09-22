'use client';
import Grid from '@mui/material/Grid';
import { PageHeader, MetricCard } from '@smartcode/ui';

export default function AuditorDashboardPage() {
  return (
    <>
      <PageHeader title="My Dashboard" description="Your audit overview" />
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard label="Audit Queue" value="—" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard label="Completed Today" value="—" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard label="Review Required" value="—" />
        </Grid>
      </Grid>
    </>
  );
}
