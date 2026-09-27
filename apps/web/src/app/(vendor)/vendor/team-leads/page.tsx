'use client';
import * as React from 'react';
import Chip from '@mui/material/Chip';
import type { VendorMember } from '@smartcode/types';
import { Breadcrumb, DataTable, ErrorState, PageHeader } from '@smartcode/ui';
import { useMyVendor } from '@/features/vendors/use-vendors';
import { formatDate, personName } from '@/lib/format';

export default function Page() {
  const { data, isLoading, isError, refetch } = useMyVendor();
  return (
    <>
      <PageHeader title="Team Leads" description="Team Leads assigned to your vendor." breadcrumb={<Breadcrumb items={[{ label: 'Vendor', href: '/vendor' }, { label: 'Team Leads' }]} />} />
      {isError ? (
        <ErrorState onRetry={() => refetch()} description="Could not load Team Leads." />
      ) : (
        <DataTable<VendorMember>
          isLoading={isLoading}
          rows={data?.teamLeads ?? []}
          rowKey={(m) => m.assignmentId}
          emptyTitle="No Team Leads assigned"
          emptyDescription="Your Manager assigns Team Leads to your vendor."
          columns={[
            { key: 'name', header: 'Team Lead', render: (m) => personName(m.user) },
            { key: 'employeeId', header: 'Employee ID', render: (m) => m.user.employeeId },
            { key: 'email', header: 'Email', render: (m) => m.user.email },
            { key: 'team', header: 'Team', render: (m) => m.team?.name ?? '—' },
            { key: 'coders', header: 'Active Coders', align: 'right', render: (m) => m.coderCount },
            { key: 'status', header: 'Status', render: (m) => <Chip size="small" label={m.user.isActive ? 'Active' : 'Inactive'} color={m.user.isActive ? 'success' : 'default'} /> },
            { key: 'assignedAt', header: 'Assigned', render: (m) => formatDate(m.assignedAt) },
          ]}
        />
      )}
    </>
  );
}
