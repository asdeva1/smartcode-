'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb } from '@smartcode/ui';
import { REPORTS_BY_ROLE } from '@smartcode/types';
import { ReportsView } from '@/components/data/ReportsView';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Your audit productivity, status and error reports."
        breadcrumb={<Breadcrumb items={[{ label: 'Auditor', href: '/auditor' }, { label: 'Reports' }]} />}
      />
      <ReportsView reports={REPORTS_BY_ROLE.AUDITOR} role="AUDITOR" />
    </>
  );
}
