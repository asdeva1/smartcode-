'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb } from '@smartcode/ui';
import { ChartRepository } from '@/features/charts/ChartRepository';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Charts"
        description="Charts belonging to your team's projects."
        breadcrumb={<Breadcrumb items={[{ label: 'Team Lead', href: '/team-lead' }, { label: 'Charts' }]} />}
      />
      <ChartRepository role="TEAM_LEAD" />
    </>
  );
}
