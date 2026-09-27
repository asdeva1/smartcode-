'use client';
import * as React from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import { Plus } from 'lucide-react';
import type { VendorDetail as VendorDetailDto, VendorMember, VendorPerson } from '@smartcode/types';
import { Breadcrumb, Button, ConfirmDialog, DataTable, ErrorState, LoadingState, PageHeader, Pagination, Tabs, useToast } from '@smartcode/ui';
import { errorMessage, formatDate, formatDateTime, personName } from '@/lib/format';
import { ReworkTable } from '@/features/rework/ReworkTable';
import { useInvalidateVendors, useRemoveMember, useSetAccountActive, useSetVendorActive, useVendor, useVendorActivity } from './use-vendors';
import { VendorMetrics } from './VendorMetrics';
import { VendorStructureView } from './VendorStructureView';
import { VendorFormDialog } from './VendorFormDialog';
import { AssignMemberDialog } from './AssignMemberDialog';
import { CreateVendorAccountDialog } from './CreateVendorAccountDialog';
import { ResetPasswordDialog, type ResetPasswordTarget } from '@/features/users/ResetPasswordDialog';
import { ChangeLoginNameDialog, type ChangeLoginNameTarget } from '@/features/users/ChangeLoginNameDialog';

type Tab = 'overview' | 'structure' | 'team-leads' | 'auditors' | 'accounts' | 'activity';
const statusChip = (isActive: boolean) => (
  <Chip size="small" label={isActive ? 'Active' : 'Inactive'} color={isActive ? 'success' : 'default'} variant={isActive ? 'filled' : 'outlined'} />
);

/** Manager view of one vendor: overview metrics, structure, assignments, accounts and activity. */
export function VendorDetail({ id }: { id: string }) {
  const { showToast } = useToast();
  const { data, isLoading, isError, refetch, error } = useVendor(id);
  const setActive = useSetVendorActive();
  const [tab, setTab] = React.useState<Tab>('overview');
  const [editing, setEditing] = React.useState(false);

  if (isLoading) return <LoadingState label="Loading vendor..." />;
  if (isError || !data) return <ErrorState title="Vendor not available" description={errorMessage(error, 'Could not load this vendor.')} onRetry={() => refetch()} />;

  const toggle = () =>
    setActive.mutate(
      { id, isActive: !data.isActive },
      {
        onSuccess: () => showToast(`${data.name} ${data.isActive ? 'deactivated' : 'activated'}.`, 'success'),
        onError: (err) => showToast(errorMessage(err, 'Could not change the vendor status.'), 'error'),
      },
    );

  return (
    <>
      <PageHeader
        title={data.name}
        description={`Vendor code ${data.code}${data.contactName || data.contactEmail ? ` - ${[data.contactName, data.contactEmail].filter(Boolean).join(', ')}` : ''}`}
        breadcrumb={<Breadcrumb items={[{ label: 'Manager', href: '/manager' }, { label: 'Vendors', href: '/manager/vendors' }, { label: data.name }]} />}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            {statusChip(data.isActive)}
            <Button variant="outlined" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button variant="outlined" color={data.isActive ? 'error' : 'primary'} onClick={toggle} disabled={setActive.isPending}>
              {data.isActive ? 'Deactivate' : 'Activate'}
            </Button>
          </Stack>
        }
      />
      <Tabs
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'structure', label: 'Team Structure' },
          { value: 'team-leads', label: `Team Leads (${data.teamLeads.length})` },
          { value: 'auditors', label: `Auditors (${data.auditors.length})` },
          { value: 'accounts', label: `Vendor Accounts (${data.accounts.length})` },
          { value: 'activity', label: 'Activity' },
        ]}
      />
      <Box sx={{ mt: 2 }}>
        {tab === 'overview' && (
          <>
            <VendorMetrics vendorId={id} />
            <Box sx={{ mt: 3 }}>
              <ReworkTable role="MANAGER" fixedVendorId={id} key={`rework-${id}`} />
            </Box>
          </>
        )}
        {tab === 'structure' && <VendorStructureView vendorId={id} />}
        {tab === 'team-leads' && <MembersTab vendor={data} role="TEAM_LEAD" />}
        {tab === 'auditors' && <MembersTab vendor={data} role="AUDITOR" />}
        {tab === 'accounts' && <AccountsTab vendor={data} />}
        {tab === 'activity' && <ActivityTab vendorId={id} />}
      </Box>
      {editing && <VendorFormDialog vendor={data} onClose={() => setEditing(false)} />}
    </>
  );
}

function MembersTab({ vendor, role }: { vendor: VendorDetailDto; role: 'TEAM_LEAD' | 'AUDITOR' }) {
  const { showToast } = useToast();
  const remove = useRemoveMember();
  const [assigning, setAssigning] = React.useState(false);
  const [confirm, setConfirm] = React.useState<VendorMember | null>(null);
  const word = role === 'TEAM_LEAD' ? 'Team Lead' : 'Auditor';
  const rows = role === 'TEAM_LEAD' ? vendor.teamLeads : vendor.auditors;

  return (
    <>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
        <Button startIcon={<Plus size={16} />} onClick={() => setAssigning(true)} disabled={!vendor.isActive}>
          Assign {word}
        </Button>
      </Stack>
      <DataTable<VendorMember>
        rows={rows}
        rowKey={(m) => m.assignmentId}
        emptyTitle={`No ${word}s assigned`}
        emptyDescription={vendor.isActive ? `Assign an existing ${word} to this vendor.` : 'Activate the vendor to assign people.'}
        columns={[
          { key: 'name', header: word, render: (m) => personName(m.user) },
          { key: 'employeeId', header: 'Employee ID', render: (m) => m.user.employeeId },
          { key: 'email', header: 'Email', render: (m) => m.user.email },
          ...(role === 'TEAM_LEAD'
            ? [
                { key: 'team', header: 'Team', render: (m: VendorMember) => m.team?.name ?? '—' },
                { key: 'coders', header: 'Active Coders', align: 'right' as const, render: (m: VendorMember) => m.coderCount },
              ]
            : [{ key: 'projects', header: 'Assigned Projects', align: 'right' as const, render: (m: VendorMember) => m.projectCount }]),
          { key: 'status', header: 'Status', render: (m) => statusChip(m.user.isActive) },
          { key: 'assignedAt', header: 'Assigned', render: (m) => formatDate(m.assignedAt) },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (m) => (
              <Button size="small" variant="text" color="error" onClick={() => setConfirm(m)} aria-label={`Remove ${personName(m.user)}`}>
                Remove
              </Button>
            ),
          },
        ]}
      />
      {assigning && <AssignMemberDialog vendorId={vendor.id} vendorName={vendor.name} role={role} onClose={() => setAssigning(false)} />}
      <ConfirmDialog
        open={!!confirm}
        title={`Remove ${word} assignment`}
        description={
          role === 'TEAM_LEAD'
            ? `${personName(confirm?.user)} and their team will no longer be part of ${vendor.name}. The assignment is kept in history.`
            : `${personName(confirm?.user)} will no longer work inside ${vendor.name}. The assignment is kept in history.`
        }
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (confirm) {
            const m = confirm;
            remove.mutate(
              { vendorId: vendor.id, role, userId: m.user.id },
              {
                onSuccess: () => showToast(`${personName(m.user)} removed from ${vendor.name}.`, 'success'),
                onError: (err) => showToast(errorMessage(err, 'Could not remove the assignment.'), 'error'),
              },
            );
          }
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

function AccountsTab({ vendor }: { vendor: VendorDetailDto }) {
  const { showToast } = useToast();
  const setActive = useSetAccountActive();
  const invalidate = useInvalidateVendors();
  const [creating, setCreating] = React.useState(false);
  const [resetTarget, setResetTarget] = React.useState<ResetPasswordTarget | null>(null);
  const [loginNameTarget, setLoginNameTarget] = React.useState<ChangeLoginNameTarget | null>(null);
  const toggle = (a: VendorPerson) =>
    setActive.mutate(
      { id: a.id, isActive: !a.isActive },
      {
        onSuccess: () => showToast(`${personName(a)} ${a.isActive ? 'deactivated' : 'activated'}.`, 'success'),
        onError: (err) => showToast(errorMessage(err, 'Could not change the account status.'), 'error'),
      },
    );
  return (
    <>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
        <Button startIcon={<Plus size={16} />} onClick={() => setCreating(true)} disabled={!vendor.isActive}>
          Create Vendor Account
        </Button>
      </Stack>
      <DataTable<VendorPerson>
        rows={vendor.accounts}
        rowKey={(a) => a.id}
        emptyTitle="No vendor accounts"
        emptyDescription="Vendor accounts sign in to see only this vendor's data."
        columns={[
          { key: 'name', header: 'Name', render: (a) => personName(a) },
          { key: 'employeeId', header: 'Employee ID', render: (a) => a.employeeId },
          { key: 'loginName', header: 'Login Name', render: (a) => a.loginName },
          { key: 'email', header: 'Email', render: (a) => a.email },
          { key: 'status', header: 'Status', render: (a) => statusChip(a.isActive) },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (a) => (
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button size="small" variant="text" onClick={() => setResetTarget({ id: a.id, label: personName(a) })}>
                  Reset Password
                </Button>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setLoginNameTarget({ id: a.id, label: personName(a), currentLoginName: a.loginName })}
                >
                  Change Login Name
                </Button>
                <Button size="small" variant="text" onClick={() => toggle(a)}>
                  {a.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              </Stack>
            ),
          },
        ]}
      />
      {creating && <CreateVendorAccountDialog vendorId={vendor.id} vendorName={vendor.name} onClose={() => setCreating(false)} />}
      <ResetPasswordDialog target={resetTarget} onClose={() => setResetTarget(null)} />
      <ChangeLoginNameDialog target={loginNameTarget} onClose={() => setLoginNameTarget(null)} onChanged={() => invalidate()} />
    </>
  );
}

function ActivityTab({ vendorId }: { vendorId: string }) {
  const [page, setPage] = React.useState(1);
  const { data, isLoading, isError, refetch } = useVendorActivity(vendorId, page);
  if (isError) return <ErrorState onRetry={() => refetch()} description="Could not load activity." />;
  return (
    <>
      <DataTable
        isLoading={isLoading}
        rows={data?.data ?? []}
        rowKey={(r) => r.id}
        emptyTitle="No activity yet"
        columns={[
          { key: 'when', header: 'When', render: (r) => formatDateTime(r.timestamp) },
          { key: 'who', header: 'User', render: (r) => (r.actor ? `${personName(r.actor)} (${r.actor.employeeId})` : '—') },
          { key: 'role', header: 'Role', render: (r) => r.role ?? '—' },
          { key: 'action', header: 'Action', render: (r) => r.action.replace(/_/g, ' ').toLowerCase() },
          { key: 'entity', header: 'Record', render: (r) => r.entity },
        ]}
      />
      {data && data.total > 0 && <Pagination page={page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />}
    </>
  );
}
