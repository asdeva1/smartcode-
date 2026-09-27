'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb } from '@smartcode/ui';
import { ChartRepository } from '@/features/charts/ChartRepository';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Charts"
        description="All charts with production and audit history."
        breadcrumb={<Breadcrumb items={[{ label: 'Manager', href: '/manager' }, { label: 'Charts' }]} />}
      />
      <ChartRepository role="MANAGER" />
    </>
  );
}
