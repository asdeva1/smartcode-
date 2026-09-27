'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb } from '@smartcode/ui';
import { ManagerSetup } from '@/features/projects/ManagerSetup';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Teams"
        description="Teams, the projects each team works, and Auditor project assignments."
        breadcrumb={<Breadcrumb items={[{ label: 'Manager', href: '/manager' }, { label: 'Teams' }]} />}
      />
      <ManagerSetup />
    </>
  );
}
