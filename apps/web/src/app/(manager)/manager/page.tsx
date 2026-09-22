'use client';
import * as React from 'react';
import Grid from '@mui/material/Grid';
import { PageHeader, MetricCard } from '@smartcode/ui';

/**
 * Metric cards render '—' rather than invented numbers - see brief
 * Section 13 "Do NOT create fake statistics." These wire up to real
 * data (production/audit/team counts) once the Reports module lands
 * in Phase 6 per docs/10-IMPLEMENTATION-ROADMAP.md.
 */
export default function ManagerDashboardPage() {
  return (
    <>
      <PageHeader title="Manager Dashboard" description="Organization-wide overview" />
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Active Team Leads" value="—" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Active Auditors" value="—" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Active Coders" value="—" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Charts in Production" value="—" />
        </Grid>
      </Grid>
    </>
  );
}
