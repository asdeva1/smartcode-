'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import type { Role } from '@smartcode/types';
import { Breadcrumb, LoadingState, PageHeader } from '@smartcode/ui';
import { ReworkTable } from './ReworkTable';

const COPY: Record<Role, { home: string; crumb: string; description: string }> = {
  MANAGER: { home: '/manager', crumb: 'Manager', description: 'Rework across all vendors and teams.' },
  VENDOR: { home: '/vendor', crumb: 'Vendor', description: "Rework inside your vendor's teams." },
  TEAM_LEAD: { home: '/team-lead', crumb: 'Team Lead', description: "Charts sent back by Auditors for your team's coders, and their resolution." },
  CODER: { home: '/coder', crumb: 'Coder', description: 'Charts an Auditor sent back to you. Correct them and resolve to send them for re-audit.' },
  AUDITOR: { home: '/auditor', crumb: 'Auditor', description: 'Rework you requested. Resolved items are ready for re-audit.' },
};

function Table({ role }: { role: Role }) {
  const openId = useSearchParams().get('open');
  return <ReworkTable key={openId ?? 'list'} role={role} openId={openId} />;
}

export function ReworkPage({ role }: { role: Role }) {
  const c = COPY[role];
  return (
    <>
      <PageHeader title="Rework" description={c.description} breadcrumb={<Breadcrumb items={[{ label: c.crumb, href: c.home }, { label: 'Rework' }]} />} />
      <React.Suspense fallback={<LoadingState />}>
        <Table role={role} />
      </React.Suspense>
    </>
  );
}
