'use client';
import Grid from '@mui/material/Grid';
import { PageHeader, MetricCard } from '@smartcode/ui';

export default function TeamLeadDashboardPage() {
  return (
    <>
      <PageHeader title="Team Lead Dashboard" description="Your team's overview" />
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard label="Active Coders" value="—" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard label="Charts In Progress" value="—" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard label="Completed Today" value="—" />
        </Grid>
      </Grid>
    </>
  );
}
