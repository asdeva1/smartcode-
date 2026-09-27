'use client';
import * as React from 'react';
import { PageHeader, Breadcrumb } from '@smartcode/ui';
import { AuditsTable } from '@/features/audits/AuditsTable';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Audits"
        description="Audits of your team's charts. Resolve audits flagged Review Required."
        breadcrumb={<Breadcrumb items={[{ label: 'Team Lead', href: '/team-lead' }, { label: 'Audits' }]} />}
      />
      <AuditsTable role="TEAM_LEAD" />
    </>
  );
}
