'use client';
import * as React from 'react';
import { Breadcrumb, PageHeader } from '@smartcode/ui';
import { EmployeeDirectoryManager } from '@/features/employees/EmployeeDirectoryManager';

/**
 * Manager-only Employee Directory (docs/09-BUSINESS-RULES.md section 11,
 * Phase 9) - a searchable, enterprise-wide account directory. Not a
 * CRM/ATS; backend enforces Manager-only access independently of this nav.
 */
export default function EmployeeDirectoryPage() {
  return (
    <>
      <PageHeader
        title="Employee Directory"
        description="Search every account in SmartCode by EMP-ID, name, login name, or email."
        breadcrumb={<Breadcrumb items={[{ label: 'Manager', href: '/manager' }, { label: 'Employee Directory' }]} />}
      />
      <EmployeeDirectoryManager />
    </>
  );
}
