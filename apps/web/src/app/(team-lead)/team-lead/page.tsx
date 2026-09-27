'use client';
import * as React from 'react';
import { PageHeader } from '@smartcode/ui';
import { DashboardMetrics } from '@/components/data/DashboardMetrics';
import { WelcomeAndQuickActions } from '@/components/data/QuickActions';

export default function TeamLeadDashboardPage() {
  return (
    <>
      <PageHeader title="Team Lead Dashboard" description="Your team's overview" />
      <WelcomeAndQuickActions
        actions={[
          { label: 'Manage Coders', href: '/team-lead/coders' },
          { label: 'Team Production', href: '/team-lead/production' },
          { label: 'Audits', href: '/team-lead/audits' },
          { label: 'Charts', href: '/team-lead/charts' },
          { label: 'Reports', href: '/team-lead/reports' },
        ]}
      />
      <DashboardMetrics />
    </>
  );
}
