'use client';
import * as React from 'react';
import { PageHeader } from '@smartcode/ui';
import { DashboardMetrics } from '@/components/data/DashboardMetrics';
import { WelcomeAndQuickActions } from '@/components/data/QuickActions';
import { ReworkPanel } from '@/features/rework/ReworkPanel';

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
          { label: 'Rework', href: '/team-lead/rework' },
          { label: 'Reports', href: '/team-lead/reports' },
        ]}
      />
      <DashboardMetrics />
      <ReworkPanel role="TEAM_LEAD" />
    </>
  );
}
