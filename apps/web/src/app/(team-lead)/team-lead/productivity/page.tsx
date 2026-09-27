'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb } from '@smartcode/ui';
import { ReportsView } from '@/components/data/ReportsView';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Productivity"
        description="Coder productivity from your team's current production (charts, pages, DOS, ICDs, errors)."
        breadcrumb={<Breadcrumb items={[{ label: 'Team Lead', href: '/team-lead' }, { label: 'Productivity' }]} />}
      />
      <ReportsView reports={['coder-productivity', 'production-summary']} role="TEAM_LEAD" />
    </>
  );
}
