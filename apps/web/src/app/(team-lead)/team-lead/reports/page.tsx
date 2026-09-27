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
        description="Team-scoped production and audit reports."
        breadcrumb={<Breadcrumb items={[{ label: 'Team Lead', href: '/team-lead' }, { label: 'Reports' }]} />}
      />
      <ReportsView reports={REPORTS_BY_ROLE.TEAM_LEAD} role="TEAM_LEAD" />
    </>
  );
}
