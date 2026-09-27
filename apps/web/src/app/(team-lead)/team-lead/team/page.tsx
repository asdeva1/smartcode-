'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb } from '@smartcode/ui';
import { CodersManager } from '@/features/coders/CodersManager';

export default function Page() {
  return (
    <CodersManager
      headerActions={(actions) => (
        <PageHeader
          title="My Team"
          description="Your team roster: view, create, edit and activate/deactivate Coders."
          breadcrumb={<Breadcrumb items={[{ label: 'Team Lead', href: '/team-lead' }, { label: 'My Team' }]} />}
          actions={actions}
        />
      )}
    />
  );
}
