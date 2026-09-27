'use client';
import { Breadcrumb, PageHeader } from '@smartcode/ui';
import { ChartRepository } from '@/features/charts/ChartRepository';

export default function Page() {
  return (
    <>
      <PageHeader title="Charts" description="Charts in your vendor's projects." breadcrumb={<Breadcrumb items={[{ label: 'Vendor', href: '/vendor' }, { label: 'Charts' }]} />} />
      <ChartRepository role="VENDOR" />
    </>
  );
}
