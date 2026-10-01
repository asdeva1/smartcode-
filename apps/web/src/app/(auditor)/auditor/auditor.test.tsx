import * as React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuditEntryPage from './audit-entry/page';
import QueuePage from './queue/page';
import AuditsPage from './audits/page';
import AuditorDashboard from './page';
import { apiDownload, apiFetch, apiUpload } from '@/lib/api-client';
import { callsTo, chooseOption, expectNoProhibitedField, page, renderWithProviders, routeApi } from '@/test-utils/render';

const push = jest.fn();
const replace = jest.fn();
let searchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/auditor',
  useSearchParams: () => searchParams,
}));
jest.mock('@/lib/api-client', () => ({
  ...jest.requireActual('@/lib/api-client'),
  apiFetch: jest.fn(),
  apiUpload: jest.fn(),
  apiDownload: jest.fn(),
}));
jest.mock('@/features/auth/use-auth', () => ({
  useCurrentUser: () => ({
    user: { id: 'aud-1', employeeId: 'A100', loginName: 'alex.a', fullName: 'Alex Auditor', role: 'AUDITOR', teamId: null, isActive: true, email: 'a@x.local' },
    isLoading: false,
    isError: false,
  }),
}));

const fetchMock = apiFetch as jest.Mock;
const uploadMock = apiUpload as jest.Mock;
const downloadMock = apiDownload as jest.Mock;
const person = (id: string, fullName: string, employeeId: string, loginName: string) => ({ id, fullName, employeeId, loginName });
const coder = person('c-1', 'Cody Coder', 'EMP500', 'cody.c');
const me = person('aud-1', 'Alex Auditor', 'A100', 'alex.a');

const audit = (over: Record<string, unknown> = {}) => ({
  id: 'au-1', chartId: 'CH-100', productionEntryId: 'p-1', productionVersion: 1, auditErrors: 2, errorExceptions: 1, totalErrors: 3,
  status: 'IN_PROGRESS', auditDate: '2026-01-12', remarks: null, createdAt: '', updatedAt: '', auditor: me, coder, project: { id: 'pr', name: 'Cardiology', client: null },
  ...over,
});

const lookup = (over: Record<string, unknown> = {}) => ({
  chartId: 'CH-100',
  project: { id: 'pr', name: 'Cardiology', client: { id: 'cl', name: 'Acme' } },
  production: { id: 'p-1', version: 1, pageCount: 12, totalDOS: 3, totalICDs: 7, codedDate: '2026-01-10', status: 'COMPLETED', coder },
  audits: [],
  canAudit: true,
  reason: null,
  openAuditId: null,
  reauditTargetId: null,
  ...over,
});

beforeEach(() => {
  fetchMock.mockReset();
  uploadMock.mockReset();
  downloadMock.mockReset();
  push.mockReset();
  replace.mockReset();
  searchParams = new URLSearchParams();
});

describe('Auditor - Audit Entry', () => {
  it('validates the Chart ID before fetching', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuditEntryPage />);
    await user.click(screen.getByRole('button', { name: 'Fetch' }));
    expect(await screen.findByText('Chart ID is required')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retrieves production by Chart ID and shows it read-only (no editable production inputs)', async () => {
    routeApi(fetchMock, { 'GET /charts/CH-100/production': lookup() });
    const user = userEvent.setup();
    renderWithProviders(<AuditEntryPage />);
    await user.type(screen.getByLabelText('Chart ID'), 'CH-100');
    await user.click(screen.getByRole('button', { name: 'Fetch' }));

    expect(await screen.findByText('Cody Coder')).toBeInTheDocument();
    expect(screen.getByText('EMP500')).toBeInTheDocument();
    expect(screen.getByText('cody.c')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Production - chart CH-100 (version 1)')).toBeInTheDocument();
    for (const label of ['Page Count', 'Total DOS', 'Total ICDs', 'Coded Date', 'Coder Name', 'Employee ID', 'Login Name']) {
      expect(screen.queryByRole('textbox', { name: label })).not.toBeInTheDocument();
      expect(screen.queryByRole('spinbutton', { name: label })).not.toBeInTheDocument();
    }
    expect(replace).toHaveBeenCalledWith('/auditor/audit-entry?chartId=CH-100');
    expectNoProhibitedField();
  });

  it('shows Total = Audit Errors + Error Exceptions but never sends a total; Complete Audit posts COMPLETED', async () => {
    searchParams = new URLSearchParams('chartId=CH-100');
    routeApi(fetchMock, { 'GET /charts/CH-100/production': lookup(), 'POST /audits': audit({ status: 'COMPLETED', totalErrors: 6 }) });
    const user = userEvent.setup();
    renderWithProviders(<AuditEntryPage />);
    const errors = await screen.findByLabelText('Audit Errors');
    await user.clear(errors);
    await user.type(errors, '4');
    await user.clear(screen.getByLabelText('Error Exceptions'));
    await user.type(screen.getByLabelText('Error Exceptions'), '2');
    expect(screen.getByLabelText('Total Number of Errors')).toHaveValue('6');
    expect(screen.getByLabelText('Total Number of Errors')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Complete Audit' }));
    await waitFor(() => expect(callsTo(fetchMock, '/audits', 'POST')).toHaveLength(1));
    const body = JSON.parse(callsTo(fetchMock, '/audits', 'POST')[0][1].body);
    expect(body).toMatchObject({ chartId: 'CH-100', auditErrors: 4, errorExceptions: 2, status: 'COMPLETED' });
    expect(body).not.toHaveProperty('totalErrors');
    for (const f of ['pageCount', 'totalDOS', 'totalICDs', 'codedDate', 'coderId', 'auditorId']) expect(body).not.toHaveProperty(f);
    expect(await screen.findByText(/total errors 6/)).toBeInTheDocument();
  });

  it.each([
    ['Save Audit', 'IN_PROGRESS'],
    ['Review Required', 'REVIEW_REQUIRED'],
    ['Rework', 'REJECTED'],
  ])('"%s" records status %s', async (label, status) => {
    searchParams = new URLSearchParams('chartId=CH-100');
    routeApi(fetchMock, { 'GET /charts/CH-100/production': lookup(), 'POST /audits': audit({ status }) });
    const user = userEvent.setup();
    renderWithProviders(<AuditEntryPage />);
    // "Rework" sends the chart back to the Coder and now requires the reason (in Remarks).
    if (status === 'REJECTED') await user.type(await screen.findByLabelText('Remarks'), 'ICD missing for DOS 2');
    await user.click(await screen.findByRole('button', { name: label }));
    await waitFor(() => expect(callsTo(fetchMock, '/audits', 'POST')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/audits', 'POST')[0][1].body).status).toBe(status);
  });

  it('validates audit fields (no negatives) before submitting', async () => {
    searchParams = new URLSearchParams('chartId=CH-100');
    routeApi(fetchMock, { 'GET /charts/CH-100/production': lookup() });
    const user = userEvent.setup();
    renderWithProviders(<AuditEntryPage />);
    const errors = await screen.findByLabelText('Audit Errors');
    await user.clear(errors);
    await user.type(errors, '-1');
    await user.click(screen.getByRole('button', { name: 'Complete Audit' }));
    expect(await screen.findByText('Audit errors cannot be negative')).toBeInTheDocument();
    expect(callsTo(fetchMock, '/audits', 'POST')).toHaveLength(0);
  });

  it('continues the caller\'s own open audit with PATCH', async () => {
    searchParams = new URLSearchParams('chartId=CH-100');
    routeApi(fetchMock, {
      'GET /charts/CH-100/production': lookup({ canAudit: false, reason: 'already has an audit', audits: [audit()], openAuditId: 'au-1' }),
      'PATCH /audits/au-1': audit({ status: 'COMPLETED' }),
    });
    const user = userEvent.setup();
    renderWithProviders(<AuditEntryPage />);
    expect(await screen.findByText('Continue your audit')).toBeInTheDocument();
    expect(screen.getByLabelText('Audit Errors')).toHaveValue(2);
    await user.click(screen.getByRole('button', { name: 'Complete Audit' }));
    await waitFor(() => expect(callsTo(fetchMock, '/audits/au-1', 'PATCH')).toHaveLength(1));
  });

  it('re-audits a REJECTED audit as a new record via the re-audit endpoint', async () => {
    searchParams = new URLSearchParams('chartId=CH-100');
    routeApi(fetchMock, {
      'GET /charts/CH-100/production': lookup({ canAudit: false, reason: 'was REJECTED', audits: [audit({ status: 'REJECTED' })], reauditTargetId: 'au-1' }),
      'POST /audits/au-1/reaudit': audit({ id: 'au-2', status: 'COMPLETED' }),
    });
    const user = userEvent.setup();
    renderWithProviders(<AuditEntryPage />);
    expect(await screen.findByText(/Re-audit \(the rejected audit is kept in history\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Complete Audit' }));
    await waitFor(() => expect(callsTo(fetchMock, '/audits/au-1/reaudit', 'POST')).toHaveLength(1));
    expect(callsTo(fetchMock, '/audits/au-1', 'PATCH')).toHaveLength(0);
  });

  it('explains why a chart cannot be audited, and shows lookup errors', async () => {
    searchParams = new URLSearchParams('chartId=CH-100');
    routeApi(fetchMock, {
      'GET /charts/CH-100/production': lookup({ canAudit: false, reason: 'Production for chart CH-100 is REWORK; only COMPLETED production can be audited' }),
    });
    const r = renderWithProviders(<AuditEntryPage />);
    expect(await screen.findByText(/only COMPLETED production can be audited/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete Audit' })).not.toBeInTheDocument();
    r.unmount();

    routeApi(fetchMock, {
      'GET /charts/CH-100/production': () => {
        throw new Error('Chart CH-100 was not found in your assigned projects');
      },
    });
    renderWithProviders(<AuditEntryPage />);
    expect(await screen.findByText('Chart CH-100 was not found in your assigned projects')).toBeInTheDocument();
  });
});

describe('Auditor - Audit Queue', () => {
  const item = { chartId: 'CH-300', project: { id: 'pr', name: 'Cardiology', client: null }, version: 2, pageCount: 9, totalDOS: 1, totalICDs: 4, codedDate: '2026-01-11', productionStatus: 'COMPLETED', coder, queueState: 'PENDING_AUDIT', myAuditId: null, isReaudit: true };

  it('lists pending charts with a link into Audit Entry, filters by state and exports', async () => {
    routeApi(fetchMock, { 'GET /auditor/queue?': page([item]), 'GET /projects/mine': [] });
    downloadMock.mockResolvedValue('q.csv');
    const user = userEvent.setup();
    renderWithProviders(<QueuePage />);
    expect(await screen.findByText('CH-300')).toBeInTheDocument();
    expect(screen.getByText('Re-audit')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Audit' })).toHaveAttribute('href', '/auditor/audit-entry?chartId=CH-300');
    await chooseOption(user, 'Queue', 'My in-progress audits');
    await waitFor(() => expect(callsTo(fetchMock, '/auditor/queue?page=1&pageSize=25&state=in_progress')).not.toHaveLength(0));
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export CSV' }));
    await waitFor(() => expect(downloadMock).toHaveBeenCalledWith('/auditor/queue/export?state=in_progress&format=csv'));
  });

  it('shows the empty state', async () => {
    routeApi(fetchMock, { 'GET /auditor/queue?': page([]), 'GET /projects/mine': [] });
    renderWithProviders(<QueuePage />);
    expect(await screen.findByText('Nothing to audit')).toBeInTheDocument();
  });
});

describe('Auditor - View Audits', () => {
  it('offers Continue for own open audits, Re-audit for rejected ones, and no edit for completed audits', async () => {
    routeApi(fetchMock, {
      'GET /audits?': page([audit(), audit({ id: 'au-2', chartId: 'CH-200', status: 'REJECTED' }), audit({ id: 'au-3', chartId: 'CH-300', status: 'COMPLETED' })]),
    });
    const user = userEvent.setup();
    renderWithProviders(<AuditsPage />);
    const open = async (chart: string) => {
      await user.click(await screen.findByRole('button', { name: `Actions for ${chart}` }));
      const items = screen.getAllByRole('menuitem').map((m) => m.textContent);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
      return items;
    };
    expect(await open('CH-100')).toEqual(['Continue audit', 'Chart history']);
    expect(await open('CH-200')).toEqual(['Re-audit', 'Chart history']);
    expect(await open('CH-300')).toEqual(['Chart history']);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).not.toContain('Auditor');
  });

  it('imports audits from CSV with preview before commit', async () => {
    routeApi(fetchMock, { 'GET /audits?': page([]) });
    uploadMock.mockImplementation(async (path: string) =>
      path.endsWith('/preview')
        ? { fileName: 'audits.csv', totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0, rows: [{ rowNumber: 2, status: 'valid', errors: [], data: { chartId: 'CH-1', auditErrors: '1', errorExceptions: '0', status: 'COMPLETED', auditDate: '2026-01-10', remarks: '' } }] }
        : { fileName: 'audits.csv', imported: 1, skipped: 0, rows: [] },
    );
    const user = userEvent.setup();
    renderWithProviders(<AuditsPage />);
    await user.click(await screen.findByRole('button', { name: 'Import CSV' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/chartId, auditErrors, errorExceptions, status, auditDate, remarks/)).toBeInTheDocument();
    await user.upload(within(dialog).getByLabelText('CSV file'), new File(['x'], 'audits.csv', { type: 'text/csv' }));
    expect(await within(dialog).findByText('CH-1')).toBeInTheDocument();
    expect(uploadMock).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole('button', { name: 'Import 1 valid row(s)' }));
    expect(await within(dialog).findByText('Import complete: 1 imported, 0 skipped.')).toBeInTheDocument();
    expect(uploadMock.mock.calls.map((c) => c[0])).toEqual(['/audits/import/preview', '/audits/import']);
  });
});

describe('Auditor - Dashboard', () => {
  it('shows real metrics and quick-searches a Chart ID into Audit Entry', async () => {
    routeApi(fetchMock, { 'GET /reports/dashboard': { role: 'AUDITOR', metrics: [{ key: 'pendingAudits', label: 'Pending Audits', value: 7 }] } });
    const user = userEvent.setup();
    renderWithProviders(<AuditorDashboard />);
    expect(await screen.findByText('Pending Audits')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(fetchMock.mock.calls.map((c) => c[0])).toContainEqual(expect.stringMatching(/^\/reports\/dashboard\?today=\d{4}-\d{2}-\d{2}$/));
    await user.type(screen.getByLabelText('Quick search by Chart ID'), 'CH-9');
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(push).toHaveBeenCalledWith('/auditor/audit-entry?chartId=CH-9');
  });
});
