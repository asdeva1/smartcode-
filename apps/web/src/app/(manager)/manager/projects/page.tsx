'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb } from '@smartcode/ui';
import { ManagerSetup } from '@/features/projects/ManagerSetup';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Projects"
        description="Client projects, the team that works each one, and Auditor project assignments."
        breadcrumb={<Breadcrumb items={[{ label: 'Manager', href: '/manager' }, { label: 'Projects' }]} />}
      />
      <ManagerSetup initialTab="projects" />
    </>
  );
}
