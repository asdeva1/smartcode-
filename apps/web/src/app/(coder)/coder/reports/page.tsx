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
        description="Your production and productivity reports."
        breadcrumb={<Breadcrumb items={[{ label: 'Coder', href: '/coder' }, { label: 'Reports' }]} />}
      />
      <ReportsView reports={REPORTS_BY_ROLE.CODER} role="CODER" />
    </>
  );
}
