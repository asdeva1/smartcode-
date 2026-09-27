'use client';
import { Breadcrumb, PageHeader } from '@smartcode/ui';
import { AuditsTable } from '@/features/audits/AuditsTable';

export default function Page() {
  return (
    <>
      <PageHeader title="Audits" description="Audits of your vendor's charts (read-only)." breadcrumb={<Breadcrumb items={[{ label: 'Vendor', href: '/vendor' }, { label: 'Audits' }]} />} />
      <AuditsTable role="VENDOR" />
    </>
  );
}
