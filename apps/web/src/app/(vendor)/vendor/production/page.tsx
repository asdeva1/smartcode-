'use client';
import { Breadcrumb, PageHeader } from '@smartcode/ui';
import { ProductionTable } from '@/features/production/ProductionTable';

export default function Page() {
  return (
    <>
      <PageHeader title="Production" description="Production entered by your vendor's coders (read-only)." breadcrumb={<Breadcrumb items={[{ label: 'Vendor', href: '/vendor' }, { label: 'Production' }]} />} />
      <ProductionTable role="VENDOR" />
    </>
  );
}
