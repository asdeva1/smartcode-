'use client';
import { Breadcrumb, PageHeader } from '@smartcode/ui';
import { VendorStructureView } from '@/features/vendors/VendorStructureView';

export default function Page() {
  return (
    <>
      <PageHeader title="Teams" description="Your vendor's teams, coders, projects and auditors." breadcrumb={<Breadcrumb items={[{ label: 'Vendor', href: '/vendor' }, { label: 'Teams' }]} />} />
      <VendorStructureView vendorId={null} />
    </>
  );
}
