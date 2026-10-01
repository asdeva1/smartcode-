'use client';
import * as React from 'react';
import { PageHeader } from '@smartcode/ui';
import { OrgContextBanner } from '@/components/data/OrgContextBanner';
import { WelcomeAndQuickActions } from '@/components/data/QuickActions';
import { ReworkPanel } from '@/features/rework/ReworkPanel';
import { VendorMetrics } from '@/features/vendors/VendorMetrics';
import { useMyVendor } from '@/features/vendors/use-vendors';

/** Vendor dashboard - every figure is computed by the backend inside this vendor's scope only. */
export default function VendorDashboardPage() {
  const { data } = useMyVendor();
  return (
    <>
      <PageHeader title="Vendor Dashboard" description={data ? `${data.name} (${data.code})` : 'Your vendor overview'} />
      <OrgContextBanner />
      <WelcomeAndQuickActions
        actions={[
          { label: 'Team Leads', href: '/vendor/team-leads' },
          { label: 'Teams', href: '/vendor/teams' },
          { label: 'Production', href: '/vendor/production' },
          { label: 'Audits', href: '/vendor/audits' },
          { label: 'Rework', href: '/vendor/rework' },
          { label: 'Reports', href: '/vendor/reports' },
        ]}
      />
      <VendorMetrics vendorId={null} />
      <ReworkPanel role="VENDOR" />
    </>
  );
}
