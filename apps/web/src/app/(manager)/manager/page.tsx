'use client';
import * as React from 'react';
import { PageHeader } from '@smartcode/ui';
import { DashboardMetrics } from '@/components/data/DashboardMetrics';

/** Organisation-wide figures computed by the backend from real data. */
export default function ManagerDashboardPage() {
  return (
    <>
      <PageHeader title="Manager Dashboard" description="Organization-wide overview" />
      <DashboardMetrics />
    </>
  );
}
