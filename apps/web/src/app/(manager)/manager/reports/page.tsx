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
        description="Production, audit, coder and auditor summaries."
        breadcrumb={<Breadcrumb items={[{ label: 'Manager', href: '/manager' }, { label: 'Reports' }]} />}
      />
      <ReportsView reports={REPORTS_BY_ROLE.MANAGER} />
    </>
  );
}
