'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb } from '@smartcode/ui';
import { ProductionTable } from '@/features/production/ProductionTable';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Production"
        description="All production entries across teams."
        breadcrumb={<Breadcrumb items={[{ label: 'Manager', href: '/manager' }, { label: 'Production' }]} />}
      />
      <ProductionTable role="MANAGER" />
    </>
  );
}
