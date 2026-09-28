'use client';
import * as React from 'react';
import { Breadcrumb, PageHeader } from '@smartcode/ui';
import { PasswordResetRequestsManager } from '@/features/password-reset/PasswordResetRequestsManager';

/**
 * Manager's password reset request queue (docs/09-BUSINESS-RULES.md
 * section 8, Phase 8) - a Vendor or Team Lead can no longer reset a
 * Coder's password directly; they file a request here for the Manager
 * to approve (generating a single-use reset link) or reject.
 */
export default function PasswordResetRequestsPage() {
  return (
    <>
      <PageHeader
        title="Password Reset Requests"
        description="Requests from Vendors and Team Leads to reset a Coder's password. Approving generates a single-use reset link for you to send them."
        breadcrumb={<Breadcrumb items={[{ label: 'Manager', href: '/manager' }, { label: 'Password Reset Requests' }]} />}
      />
      <PasswordResetRequestsManager />
    </>
  );
}
