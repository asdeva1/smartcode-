'use client';
import { Breadcrumb, PageHeader } from '@smartcode/ui';
import { REPORTS_BY_ROLE } from '@smartcode/types';
import { ReportsView } from '@/components/data/ReportsView';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Internal production and audit reports, limited to your vendor."
        breadcrumb={<Breadcrumb items={[{ label: 'Vendor', href: '/vendor' }, { label: 'Reports' }]} />}
      />
      <ReportsView reports={REPORTS_BY_ROLE.VENDOR} role="VENDOR" />
    </>
  );
}
