'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb, Tabs } from '@smartcode/ui';
import { ChartRepository } from '@/features/charts/ChartRepository';
import { TeamLeadAllocationUpload } from '@/features/chart-allocation/TeamLeadAllocationUpload';

export default function Page() {
  const [tab, setTab] = React.useState('repository');

  return (
    <>
      <PageHeader
        title="Charts"
        description="Charts belonging to your team's projects."
        breadcrumb={<Breadcrumb items={[{ label: 'Team Lead', href: '/team-lead' }, { label: 'Charts' }]} />}
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'repository', label: 'Chart Repository' },
          { value: 'allocation', label: 'Chart Allocation' },
        ]}
      />
      <div style={{ marginTop: 16 }}>
        {tab === 'repository' && <ChartRepository role="TEAM_LEAD" />}
        {tab === 'allocation' && <TeamLeadAllocationUpload />}
      </div>
    </>
  );
}
