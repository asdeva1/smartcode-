'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Breadcrumb, LoadingState, PageHeader } from '@smartcode/ui';
import { AuditEntryWorkspace } from '@/features/audits/AuditEntryWorkspace';

function Workspace() {
  const chartId = useSearchParams().get('chartId') ?? undefined;
  return <AuditEntryWorkspace key={chartId ?? 'empty'} initialChartId={chartId} />;
}

export default function Page() {
  return (
    <>
      <PageHeader
        title="Audit Entry"
        description="Enter a Chart ID. Production data is retrieved automatically and cannot be edited here."
        breadcrumb={<Breadcrumb items={[{ label: 'Auditor', href: '/auditor' }, { label: 'Audit Entry' }]} />}
      />
      <React.Suspense fallback={<LoadingState />}>
        <Workspace />
      </React.Suspense>
    </>
  );
}
