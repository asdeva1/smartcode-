'use client';
import * as React from 'react';
import Link from 'next/link';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Button, DataTable, ErrorState } from '@smartcode/ui';
import { useVendorOverview } from './use-vendors';

/** Manager dashboard: every vendor with its status, structure and live workload. */
export function VendorOverview() {
  const { data, isLoading, isError, refetch } = useVendorOverview();
  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2 }} component="section" aria-label="Vendors overview">
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          Vendors
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" component={Link} href="/manager/rework">
            View rework
          </Button>
          <Button size="small" variant="outlined" component={Link} href="/manager/vendors">
            Manage vendors
          </Button>
        </Stack>
      </Stack>
      {isError ? (
        <ErrorState onRetry={() => refetch()} description="Could not load vendors." />
      ) : (
        <DataTable
          isLoading={isLoading}
          rows={data ?? []}
          rowKey={(v) => v.id}
          emptyTitle="No vendors yet"
          emptyDescription="Create a vendor and assign its Team Leads and Auditors."
          columns={[
            { key: 'name', header: 'Vendor', render: (v) => <Link href={`/manager/vendors/${v.id}`}>{v.name}</Link> },
            { key: 'code', header: 'Code', render: (v) => v.code },
            { key: 'status', header: 'Status', render: (v) => <Chip size="small" label={v.isActive ? 'Active' : 'Inactive'} color={v.isActive ? 'success' : 'default'} /> },
            { key: 'teamLeads', header: 'Team Leads', align: 'right', render: (v) => v.teamLeads },
            { key: 'auditors', header: 'Auditors', align: 'right', render: (v) => v.auditors },
            { key: 'coders', header: 'Coders', align: 'right', render: (v) => v.coders },
            { key: 'production', header: 'Production Completed', align: 'right', render: (v) => v.productionCompleted.toLocaleString() },
            { key: 'audits', header: 'Audits Completed', align: 'right', render: (v) => v.auditsCompleted.toLocaleString() },
            {
              key: 'rework',
              header: 'Pending Rework',
              align: 'right',
              render: (v) => (v.pendingRework ? <Chip size="small" color="error" label={v.pendingRework} /> : 0),
            },
          ]}
        />
      )}
    </Paper>
  );
}
