'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb } from '@smartcode/ui';
import { ProductionForm } from '@/features/production/ProductionForm';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Add Production"
        description="Enter production for a chart. Your identity is taken from your login."
        breadcrumb={<Breadcrumb items={[{ label: 'Coder', href: '/coder' }, { label: 'My Production', href: '/coder/production' }, { label: 'Add Production' }]} />}
      />
      <ProductionForm />
    </>
  );
}
