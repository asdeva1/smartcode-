'use client';
import * as React from 'react';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import { MoreVertical, Plus, RefreshCw, Upload } from 'lucide-react';
import { CODER_IMPORT_HEADERS, type Coder } from '@smartcode/types';
import { Button, ConfirmDialog, DataTable, ErrorState, FilterBar, Input, Pagination, Select, useToast } from '@smartcode/ui';
import { ExportMenu } from '@/components/data/ExportMenu';
import { CsvImportDialog } from '@/components/data/CsvImportDialog';
import { formatDate } from '@/lib/format';
import { useCoders, useInvalidateCodersAfterImport, useRelieveCoderFromTeam, useSetCoderActive } from './use-coders';
import { CreateCoderDialog } from './CreateCoderDialog';
import { EditCoderDialog } from './EditCoderDialog';
import { CoderDetailDrawer } from './CoderDetailDrawer';
import { RequestPasswordResetDialog, type RequestPasswordResetTarget } from '@/features/users/RequestPasswordResetDialog';
import { RequestLoginNameChangeDialog, type LoginNameChangeTarget } from './RequestLoginNameChangeDialog';

const PAGE_SIZE = 25;
const name = (c: Coder) => c.fullName ?? c.loginName;

/**
 * Coder account management, scoped to the caller's own team (Team Lead)
 * or own vendor (Vendor Portal - basePath="/vendor/coders"): search,
 * status filter, pagination, refresh, view, create, edit,
 * activate/deactivate. CSV import and export are Team-Lead-only for now
 * (showImportExport=false hides both on the Vendor Portal screen).
 * Password reset (docs/09-BUSINESS-RULES.md section 8, Phase 8) is a
 * REQUEST only, for both Team Lead and Vendor - neither can reset a
 * Coder's password directly; a Manager must approve the request before a
 * reset link is generated. Requesting a Login Name change (section 9)
 * remains Team-Lead-only - a Vendor is not authorized to request that, so
 * the Vendor Portal screen passes that one flag false.
 *
 * "Relieve from Team" (Organization Assignment + Auto-Visibility
 * requirement section 1) is Team-Lead-only, enforced server-side
 * (CodersService.relieveFromTeam rejects a Vendor caller); the Vendor
 * Portal screen also hides the menu item itself via `allowRelieveFromTeam`
 * so a Vendor user is never shown an action that would just 403.
 */
export function CodersManager({
  headerActions,
  basePath = '/team-leads/coders',
  showImportExport = true,
  allowResetPassword = true,
  allowLoginNameRequest = true,
  allowRelieveFromTeam = true,
}: {
  headerActions?: (actions: React.ReactNode) => React.ReactNode;
  basePath?: string;
  showImportExport?: boolean;
  allowResetPassword?: boolean;
  allowLoginNameRequest?: boolean;
  allowRelieveFromTeam?: boolean;
}) {
  const { showToast } = useToast();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<'all' | 'active' | 'inactive'>('all');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Coder | null>(null);
  const [viewId, setViewId] = React.useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = React.useState<Coder | null>(null);
  const [menu, setMenu] = React.useState<{ el: HTMLElement; row: Coder } | null>(null);
  const [resetTarget, setResetTarget] = React.useState<RequestPasswordResetTarget | null>(null);
  const [loginNameTarget, setLoginNameTarget] = React.useState<LoginNameChangeTarget | null>(null);
  const [relieveTarget, setRelieveTarget] = React.useState<Coder | null>(null);

  const filters = { search: search || undefined, status };
  const { data, isLoading, isError, refetch, isFetching } = useCoders({ page, pageSize: PAGE_SIZE, ...filters }, basePath);
  const setActive = useSetCoderActive();
  const relieve = useRelieveCoderFromTeam(basePath);
  const invalidate = useInvalidateCodersAfterImport();

  const changeActive = (row: Coder, isActive: boolean) =>
    setActive.mutate(
      { id: row.id, isActive },
      {
        onSuccess: () => showToast(`${name(row)} ${isActive ? 'activated' : 'deactivated'}.`, 'success'),
        onError: () => showToast(`Could not ${isActive ? 'activate' : 'deactivate'} this Coder.`, 'error'),
      },
    );

  const relieveFromTeam = (row: Coder) =>
    relieve.mutate(row.id, {
      onSuccess: () => showToast(`${name(row)} has been relieved from the Team.`, 'success'),
      onError: () => showToast(`Could not relieve ${name(row)} from the Team.`, 'error'),
    });

  const actions = (
    <Stack direction="row" spacing={1}>
      {showImportExport && (
        <>
          <Button variant="outlined" startIcon={<Upload size={16} />} onClick={() => setImportOpen(true)}>
            Import CSV
          </Button>
          <ExportMenu path={`${basePath}/export`} params={filters} />
        </>
      )}
      <Button startIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
        Create Coder
      </Button>
    </Stack>
  );

  return (
    <>
      {headerActions?.(actions)}

      <FilterBar>
        <Input
          label="Search"
          placeholder="Name, login, employee ID, or email"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          sx={{ minWidth: 260 }}
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
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
        <ErrorState onRetry={() => refetch()} description="Could not load Coders. Please try again." />
      ) : (
        <>
          <DataTable<Coder>
            isLoading={isLoading}
            rows={data?.data ?? []}
            rowKey={(r) => r.id}
            emptyTitle="No Coders found"
            emptyDescription="Create a Coder account or import Coders from a CSV file."
            columns={[
              { key: 'employeeId', header: 'Employee ID', render: (r) => r.employeeId },
              { key: 'fullName', header: 'Full Name', render: (r) => r.fullName ?? '—' },
              { key: 'loginName', header: 'Login Name', render: (r) => r.loginName },
              { key: 'email', header: 'Email', render: (r) => r.email },
              { key: 'teamLead', header: 'Team Lead', render: (r) => (r.teamLead ? r.teamLead.fullName ?? r.teamLead.loginName : '—') },
              {
                key: 'status',
                header: 'Status',
                render: (r) => (
                  <Chip
                    label={r.isActive ? 'Active' : 'Inactive'}
                    size="small"
                    color={r.isActive ? 'success' : 'default'}
                    variant={r.isActive ? 'filled' : 'outlined'}
                  />
                ),
              },
              { key: 'createdAt', header: 'Created Date', render: (r) => formatDate(r.createdAt) },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: (r) => (
                  <IconButton size="small" aria-label={`Actions for ${name(r)}`} onClick={(e) => setMenu({ el: e.currentTarget, row: r })}>
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
            if (menu) setViewId(menu.row.id);
            setMenu(null);
          }}
        >
          View
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) setEditTarget(menu.row);
            setMenu(null);
          }}
        >
          Edit
        </MenuItem>
        {allowResetPassword && (
          <MenuItem
            onClick={() => {
              if (menu) setResetTarget({ id: menu.row.id, label: name(menu.row) });
              setMenu(null);
            }}
          >
            Request Password Reset
          </MenuItem>
        )}
        {allowLoginNameRequest && (
          <MenuItem
            onClick={() => {
              if (menu) setLoginNameTarget({ id: menu.row.id, label: name(menu.row), currentLoginName: menu.row.loginName });
              setMenu(null);
            }}
          >
            Request Login Name Change
          </MenuItem>
        )}
        {allowRelieveFromTeam && menu?.row.team && (
          <MenuItem
            onClick={() => {
              if (menu) setRelieveTarget(menu.row);
              setMenu(null);
            }}
          >
            Relieve from Team
          </MenuItem>
        )}
        {menu?.row.isActive ? (
          <MenuItem
            onClick={() => {
              if (menu) setConfirmTarget(menu.row);
              setMenu(null);
            }}
          >
            Deactivate
          </MenuItem>
        ) : (
          <MenuItem
            onClick={() => {
              if (menu) changeActive(menu.row, true);
              setMenu(null);
            }}
          >
            Activate
          </MenuItem>
        )}
      </Menu>

      <CreateCoderDialog open={createOpen} onClose={() => setCreateOpen(false)} basePath={basePath} />
      <EditCoderDialog open={!!editTarget} onClose={() => setEditTarget(null)} coder={editTarget} basePath={basePath} />
      <CoderDetailDrawer coderId={viewId} onClose={() => setViewId(null)} basePath={basePath} />
      {allowResetPassword && <RequestPasswordResetDialog target={resetTarget} onClose={() => setResetTarget(null)} />}
      {allowLoginNameRequest && <RequestLoginNameChangeDialog target={loginNameTarget} onClose={() => setLoginNameTarget(null)} />}
      {showImportExport && (
        <CsvImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          title="Import Coders"
          previewPath={`${basePath}/import/preview`}
          commitPath={`${basePath}/import`}
          headers={CODER_IMPORT_HEADERS}
          columns={['employeeId', 'fullName', 'loginName', 'email', 'status']}
          templateRow={['EMP1001', 'Jane Coder', 'jane.coder', 'jane.coder@example.com', 'ChangeMe123!', 'ChangeMe123!', 'Active']}
          onImported={() => invalidate()}
        />
      )}
      <ConfirmDialog
        open={!!confirmTarget}
        title="Deactivate Coder"
        description={`${confirmTarget ? name(confirmTarget) : 'This Coder'} will no longer be able to log in. Their production history is preserved and this can be reversed at any time.`}
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => {
          if (confirmTarget) changeActive(confirmTarget, false);
          setConfirmTarget(null);
        }}
        onCancel={() => setConfirmTarget(null)}
      />
      <ConfirmDialog
        open={!!relieveTarget}
        title="Relieve from Team"
        description={`${relieveTarget ? name(relieveTarget) : 'This Coder'} will no longer be an active member of ${relieveTarget?.team?.name ?? 'this Team'} and will stop receiving new Team-scoped work. Their account, production, audit, and allocation history are preserved and they can be assigned to another Team later.`}
        confirmLabel="Relieve from Team"
        destructive
        onConfirm={() => {
          if (relieveTarget) relieveFromTeam(relieveTarget);
          setRelieveTarget(null);
        }}
        onCancel={() => setRelieveTarget(null)}
      />
    </>
  );
}
