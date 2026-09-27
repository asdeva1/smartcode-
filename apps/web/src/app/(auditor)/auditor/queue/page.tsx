'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb } from '@smartcode/ui';
import { AuditQueue } from '@/features/audits/AuditQueue';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Audit Queue"
        description="Completed production in your assigned projects awaiting audit, plus your in-progress audits."
        breadcrumb={<Breadcrumb items={[{ label: 'Auditor', href: '/auditor' }, { label: 'Audit Queue' }]} />}
      />
      <AuditQueue />
    </>
  );
}
