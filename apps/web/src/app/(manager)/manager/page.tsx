'use client';
import * as React from 'react';
import Stack from '@mui/material/Stack';
import { PageHeader } from '@smartcode/ui';
import { DashboardMetrics } from '@/components/data/DashboardMetrics';
import { VendorFilter } from '@/components/data/VendorFilter';
import { VendorMetrics } from '@/features/vendors/VendorMetrics';
import { VendorOverview } from '@/features/vendors/VendorOverview';

/** Organisation-wide figures, or one vendor's figures when a vendor is selected - all computed by the backend. */
export default function ManagerDashboardPage() {
  const [vendorId, setVendorId] = React.useState('');
  return (
    <>
      <PageHeader
        title="Manager Dashboard"
        description={vendorId ? 'Vendor overview' : 'Organization-wide overview'}
        actions={
          <Stack direction="row" sx={{ minWidth: 220 }}>
            <VendorFilter value={vendorId} onChange={setVendorId} minWidth={220} />
          </Stack>
        }
      />
      {vendorId ? <VendorMetrics key={vendorId} vendorId={vendorId} /> : <DashboardMetrics />}
      <VendorOverview />
    </>
  );
}
