'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb, Tabs } from '@smartcode/ui';
import { ChartRepository } from '@/features/charts/ChartRepository';
import { ChartAllocationWorkspace } from '@/features/chart-allocation/ChartAllocationWorkspace';

export default function Page() {
  const [tab, setTab] = React.useState('repository');

  return (
    <>
      <PageHeader
        title="Charts"
        description="All charts with production and audit history."
        breadcrumb={<Breadcrumb items={[{ label: 'Manager', href: '/manager' }, { label: 'Charts' }]} />}
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
        {tab === 'repository' && <ChartRepository role="MANAGER" />}
        {tab === 'allocation' && <ChartAllocationWorkspace />}
      </div>
    </>
  );
}
