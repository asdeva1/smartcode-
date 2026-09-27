'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb } from '@smartcode/ui';
import { AuditsTable } from '@/features/audits/AuditsTable';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Audit"
        description="All audits. Resolve audits flagged Review Required."
        breadcrumb={<Breadcrumb items={[{ label: 'Manager', href: '/manager' }, { label: 'Audit' }]} />}
      />
      <AuditsTable role="MANAGER" />
    </>
  );
}
