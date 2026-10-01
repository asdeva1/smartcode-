'use client';
import * as React from 'react';
import { PageHeader } from '@smartcode/ui';
import { DashboardMetrics } from '@/components/data/DashboardMetrics';
import { OrgContextBanner } from '@/components/data/OrgContextBanner';
import { WelcomeAndQuickActions } from '@/components/data/QuickActions';
import { ReworkPanel } from '@/features/rework/ReworkPanel';

export default function CoderDashboardPage() {
  return (
    <>
      <PageHeader title="My Dashboard" description="Your production overview" />
      <OrgContextBanner />
      <WelcomeAndQuickActions
        actions={[
          { label: 'Add Production', href: '/coder/production/new' },
          { label: 'My Production', href: '/coder/production' },
          { label: 'My Charts', href: '/coder/charts' },
          { label: 'Rework', href: '/coder/rework' },
          { label: 'Reports', href: '/coder/reports' },
        ]}
      />
      <DashboardMetrics />
      <ReworkPanel role="CODER" />
    </>
  );
}
