'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb } from '@smartcode/ui';
import { ChartRepository } from '@/features/charts/ChartRepository';

export default function Page() {
  return (
    <>
      <PageHeader
        title="My Charts"
        description="Charts you have entered production for, with their version history."
        breadcrumb={<Breadcrumb items={[{ label: 'Coder', href: '/coder' }, { label: 'My Charts' }]} />}
      />
      <ChartRepository role="CODER" />
    </>
  );
}
