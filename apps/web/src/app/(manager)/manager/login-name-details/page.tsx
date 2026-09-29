'use client';
import * as React from 'react';
import { Breadcrumb, PageHeader } from '@smartcode/ui';
import { LoginNameDetailsManager } from '@/features/login-name-allocations/LoginNameDetailsManager';

/**
 * Manager's Login Name Details search (docs/09-BUSINESS-RULES.md section
 * 10, Phase 9) - the auditable allocation identity behind every Login
 * Name: who holds it now, and its complete append-only history.
 */
export default function LoginNameDetailsPage() {
  return (
    <>
      <PageHeader
        title="Login Name Details"
        description="Search Login Names to see who currently holds each one and its complete allocation history."
        breadcrumb={<Breadcrumb items={[{ label: 'Manager', href: '/manager' }, { label: 'Login Name Details' }]} />}
      />
      <LoginNameDetailsManager />
    </>
  );
}
