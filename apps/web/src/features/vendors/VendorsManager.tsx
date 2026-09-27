'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { MoreVertical, Plus, RefreshCw } from 'lucide-react';
import type { Vendor } from '@smartcode/types';
import { Breadcrumb, Button, ConfirmDialog, DataTable, ErrorState, FilterBar, Input, PageHeader, Pagination, Select, useToast } from '@smartcode/ui';
import { errorMessage, formatDate } from '@/lib/format';
import { useSetVendorActive, useVendors } from './use-vendors';
import { VendorFormDialog } from './VendorFormDialog';

const PAGE_SIZE = 25;

/** Manager -> Vendors: create, edit, activate/deactivate, search, filter, paginate, open a vendor. */
export function VendorsManager() {
  const router = useRouter();
  const { showToast } = useToast();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<'all' | 'active' | 'inactive'>('all');
  const [form, setForm] = React.useState<{ vendor: Vendor | null } | null>(null);
  const [confirm, setConfirm] = React.useState<Vendor | null>(null);
  const [menu, setMenu] = React.useState<{ el: HTMLElement; row: Vendor } | null>(null);
  const { data, isLoading, isError, refetch, isFetching } = useVendors({ page, pageSize: PAGE_SIZE, search: search || undefined, status });
  const setActive = useSetVendorActive();
  const filter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const toggle = (row: Vendor, isActive: boolean) =>
    setActive.mutate(
      { id: row.id, isActive },
      {
        onSuccess: () => showToast(`${row.name} ${isActive ? 'activated' : 'deactivated'}.`, 'success'),
        onError: (err) => showToast(errorMessage(err, 'Could not change the vendor status.'), 'error'),
      },
    );

  return (
    <>
      <PageHeader
        title="Vendors"
        description="Vendor organisations, their Team Leads and Auditors. Each vendor sees only its own data."
        breadcrumb={<Breadcrumb items={[{ label: 'Manager', href: '/manager' }, { label: 'Vendors' }]} />}
        actions={
          <Button startIcon={<Plus size={16} />} onClick={() => setForm({ vendor: null })}>
            Create Vendor
          </Button>
        }
      />
      <FilterBar>
        <Input label="Search" placeholder="Name, code or contact" value={search} onChange={(e) => filter(() => setSearch(e.target.value))} sx={{ minWidth: 240 }} />
        <Select
          label="Status"
          value={status}
          onChange={(e) => filter(() => setStatus(e.target.value as typeof status))}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          sx={{ minWidth: 160 }}
        />
        <IconButton onClick={() => refetch()} aria-label="Refresh" disabled={isFetching}>
          <RefreshCw size={18} />
        </IconButton>
      </FilterBar>

      {isError ? (
        <ErrorState onRetry={() => refetch()} description="Could not load vendors. Please try again." />
      ) : (
        <>
          <DataTable<Vendor>
            isLoading={isLoading}
            rows={data?.data ?? []}
            rowKey={(r) => r.id}
            emptyTitle="No vendors found"
            emptyDescription="Create a vendor, then assign its Team Leads and Auditors."
            columns={[
              { key: 'code', header: 'Code', render: (r) => r.code },
              { key: 'name', header: 'Vendor', render: (r) => r.name },
              { key: 'contact', header: 'Contact', render: (r) => [r.contactName, r.contactEmail].filter(Boolean).join(' - ') || '—' },
              { key: 'teamLeads', header: 'Team Leads', align: 'right', render: (r) => r.teamLeadCount },
              { key: 'auditors', header: 'Auditors', align: 'right', render: (r) => r.auditorCount },
              { key: 'accounts', header: 'Accounts', align: 'right', render: (r) => r.accountCount },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <Chip size="small" label={r.isActive ? 'Active' : 'Inactive'} color={r.isActive ? 'success' : 'default'} variant={r.isActive ? 'filled' : 'outlined'} />,
              },
              { key: 'createdAt', header: 'Created', render: (r) => formatDate(r.createdAt) },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: (r) => (
                  <IconButton size="small" aria-label={`Actions for ${r.name}`} onClick={(e) => setMenu({ el: e.currentTarget, row: r })}>
                    <MoreVertical size={16} />
                  </IconButton>
                ),
              },
            ]}
          />
          {data && data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
        </>
      )}

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            if (menu) router.push(`/manager/vendors/${menu.row.id}`);
            setMenu(null);
          }}
        >
          View
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) setForm({ vendor: menu.row });
            setMenu(null);
          }}
        >
          Edit
        </MenuItem>
        {menu?.row.isActive ? (
          <MenuItem
            onClick={() => {
              if (menu) setConfirm(menu.row);
              setMenu(null);
            }}
          >
            Deactivate
          </MenuItem>
        ) : (
          <MenuItem
            onClick={() => {
              if (menu) toggle(menu.row, true);
              setMenu(null);
            }}
          >
            Activate
          </MenuItem>
        )}
      </Menu>

      {form && <VendorFormDialog vendor={form.vendor} onClose={() => setForm(null)} />}
      <ConfirmDialog
        open={!!confirm}
        title="Deactivate vendor"
        description={`${confirm?.name ?? 'This vendor'}'s vendor accounts will be signed out and unable to log in. Team Leads, Auditors, assignments and all data are kept, and you can reactivate at any time.`}
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => {
          if (confirm) toggle(confirm, false);
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
