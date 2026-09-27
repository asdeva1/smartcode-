'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb } from '@smartcode/ui';
import { CodersManager } from '@/features/coders/CodersManager';

export default function Page() {
  return (
    <CodersManager
      headerActions={(actions) => (
        <PageHeader
          title="Coders"
          description="Manage Coder accounts on your team."
          breadcrumb={<Breadcrumb items={[{ label: 'Team Lead', href: '/team-lead' }, { label: 'Coders' }]} />}
          actions={actions}
        />
      )}
    />
  );
}
