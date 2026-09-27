'use client';
import * as React from 'react';
import { Breadcrumb, PageHeader } from '@smartcode/ui';
import { ApprovalsManager } from '@/features/approvals/ApprovalsManager';

/**
 * Manager's Universal Approval Engine queue (docs/09-BUSINESS-RULES.md
 * section 9) - today, a Team Lead's requested Coder Login Name change.
 */
export default function ApprovalsPage() {
  return (
    <>
      <PageHeader
        title="Approvals"
        description="Requests that need your decision before they take effect."
        breadcrumb={<Breadcrumb items={[{ label: 'Manager', href: '/manager' }, { label: 'Approvals' }]} />}
      />
      <ApprovalsManager />
    </>
  );
}
