'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb } from '@smartcode/ui';
import { ProductionTable } from '@/features/production/ProductionTable';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Production"
        description="Your team's production entries."
        breadcrumb={<Breadcrumb items={[{ label: 'Team Lead', href: '/team-lead' }, { label: 'Production' }]} />}
      />
      <ProductionTable role="TEAM_LEAD" />
    </>
  );
}
