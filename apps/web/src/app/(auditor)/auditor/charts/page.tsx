'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb } from '@smartcode/ui';
import { ChartRepository } from '@/features/charts/ChartRepository';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Charts"
        description="Charts in your assigned projects with production and audit history."
        breadcrumb={<Breadcrumb items={[{ label: 'Auditor', href: '/auditor' }, { label: 'Charts' }]} />}
      />
      <ChartRepository role="AUDITOR" />
    </>
  );
}
