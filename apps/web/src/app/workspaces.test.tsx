import * as React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NAVIGATION } from '@smartcode/config';
import type { AuditEntry, ProductionEntry, Role } from '@smartcode/types';
import { apiDownload, apiFetch } from '@/lib/api-client';
import { callsTo, chooseOption, expectNoProhibitedField, page, renderWithProviders, routeApi } from '@/test-utils/render';
import { productionActions } from '@/features/production/ProductionTable';
import { auditActions } from '@/features/audits/AuditsTable';
import TeamLeadAuditsPage from './(team-lead)/team-lead/audits/page';
import TeamLeadChartsPage from './(team-lead)/team-lead/charts/page';
import TeamLeadProductionPage from './(team-lead)/team-lead/production/page';
import TeamLeadDashboard from './(team-lead)/team-lead/page';
import TeamLeadReports from './(team-lead)/team-lead/reports/page';
import TeamLeadProductivity from './(team-lead)/team-lead/productivity/page';
import CoderCharts from './(coder)/coder/charts/page';
import CoderReports from './(coder)/coder/reports/page';
import CoderDashboard from './(coder)/coder/page';
import AuditorCharts from './(auditor)/auditor/charts/page';
import AuditorReports from './(auditor)/auditor/reports/page';
import ManagerDashboard from './(manager)/manager/page';
import ManagerTeams from './(manager)/manager/teams/page';
import ManagerCharts from './(manager)/manager/charts/page';
import ManagerProduction from './(manager)/manager/production/page';
import ManagerAudits from './(manager)/manager/audits/page';
import ManagerReports from './(manager)/manager/reports/page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/api-client', () => ({
  ...jest.requireActual('@/lib/api-client'),
  apiFetch: jest.fn(),
  apiDownload: jest.fn(),
}));
jest.mock('@/features/auth/use-auth', () => ({
  useCurrentUser: () => ({ user: { id: 'u-1', employeeId: 'E1', loginName: 'user.one', fullName: 'User One', role: 'TEAM_LEAD', teamId: 't', isActive: true, email: 'u@x.local' }, isLoading: false, isError: false }),
}));

const fetchMock = apiFetch as jest.Mock;
const downloadMock = apiDownload as jest.Mock;
const person = (id: string) => ({ id, fullName: `Name ${id}`, employeeId: `E-${id}`, loginName: `${id}.login` });
const project = { id: 'pr', name: 'Cardiology', client: { id: 'cl', name: 'Acme' } };

const prod = (over: Partial<ProductionEntry> = {}): ProductionEntry => ({
  id: 'p-1', chartId: 'CH-1', version: 1, isCurrent: true, pageCount: 10, totalDOS: 1, totalICDs: 2, status: 'COMPLETED',
  remarks: null, codedDate: '2026-01-10', createdAt: '', updatedAt: '', coder: person('c1'), project, auditCount: 0, ...over,
});
const aud = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'au-1', chartId: 'CH-1', productionEntryId: 'p-1', productionVersion: 1, auditErrors: 2, errorExceptions: 1, totalErrors: 3,
  status: 'REVIEW_REQUIRED', auditDate: '2026-01-12', remarks: null, createdAt: '', updatedAt: '', auditor: person('a1'), coder: person('c1'), project, ...over,
});
const chartSummary = {
  chartId: 'CH-1', project, teamName: 'Team One', currentVersion: 2, productionStatus: 'COMPLETED', coder: person('c1'), codedDate: '2026-01-10',
  auditState: 'REJECTED', latestTotalErrors: 4, isRework: true, assignedCoderId: null, createdAt: '', updatedAt: null,
};

beforeEach(() => {
  fetchMock.mockReset();
  downloadMock.mockReset();
});

describe('RBAC visibility (mirrors backend rules; the backend enforces them independently)', () => {
  it('navigation: only Coders get production pages to work in; only Auditors get the audit queue; Coders have no audit pages', () => {
    // Phase 10 navigation: "Add Production" / "Audit Entry" are reached from the Production page,
    // dashboard quick actions and the audit queue rather than a sidebar entry of their own.
    const hrefs = (role: Role) => NAVIGATION[role].map((i) => i.href);
    expect(hrefs('CODER')).toContain('/coder/production');
    for (const role of ['MANAGER', 'TEAM_LEAD', 'AUDITOR', 'VENDOR'] as Role[]) expect(hrefs(role).some((h) => h.includes('production/new'))).toBe(false);
    expect(hrefs('AUDITOR')).toContain('/auditor/queue');
    for (const role of ['MANAGER', 'TEAM_LEAD', 'CODER', 'VENDOR'] as Role[]) expect(hrefs(role).some((h) => h.includes('audit-entry') || h.includes('/queue'))).toBe(false);
    expect(hrefs('CODER').some((h) => /audit/.test(h))).toBe(false);
    for (const role of Object.keys(NAVIGATION) as Role[]) expect(hrefs(role).every((h) => h === `/${role === 'TEAM_LEAD' ? 'team-lead' : role.toLowerCase()}` || h.startsWith(`/${role === 'TEAM_LEAD' ? 'team-lead' : role.toLowerCase()}/`))).toBe(true);
  });

  it('production actions per role', () => {
    const completed = prod();
    const inProgress = prod({ status: 'IN_PROGRESS' });
    expect(productionActions('CODER', inProgress)).toEqual(['edit']);
    expect(productionActions('CODER', completed)).toEqual(['rework']);
    expect(productionActions('TEAM_LEAD', completed)).toEqual(['rework', 'cancel']);
    expect(productionActions('TEAM_LEAD', { ...completed, auditCount: 1 })).toEqual(['rework']);
    expect(productionActions('AUDITOR', completed)).toEqual([]);
    expect(productionActions('MANAGER', { ...completed, isCurrent: false })).toEqual([]);
  });

  it('audit actions per role: Coders never; completed audits are never editable', () => {
    expect(auditActions('AUDITOR', aud({ status: 'IN_PROGRESS', auditor: person('me') }), 'me')).toEqual(['continue', 'chart']);
    expect(auditActions('AUDITOR', aud({ status: 'IN_PROGRESS', auditor: person('other') }), 'me')).toEqual(['chart']);
    expect(auditActions('AUDITOR', aud({ status: 'COMPLETED' }), 'a1')).toEqual(['chart']);
    expect(auditActions('TEAM_LEAD', aud())).toEqual(['resolve', 'chart']);
    expect(auditActions('AUDITOR', aud())).toEqual(['chart']);
    expect(auditActions('CODER', aud()).filter((a) => a !== 'chart')).toEqual([]);
  });
});

describe('Team Lead workspace', () => {
  it('resolves a Review Required audit from the Audits page', async () => {
    routeApi(fetchMock, { 'GET /audits?': page([aud()]), 'POST /audits/au-1/resolve': aud({ status: 'REJECTED' }) });
    const user = userEvent.setup();
    renderWithProviders(<TeamLeadAuditsPage />);
    await user.click(await screen.findByRole('button', { name: 'Actions for CH-1' }));
    await user.click(screen.getByRole('menuitem', { name: 'Resolve review' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/3 total errors/)).toBeInTheDocument();
    await chooseOption(user, 'Resolution', /Rejected/);
    await user.click(within(dialog).getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(callsTo(fetchMock, '/audits/au-1/resolve', 'POST')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/audits/au-1/resolve', 'POST')[0][1].body)).toEqual({ status: 'REJECTED' });
  });

  it('chart repository: filters, rework flag, and a detail drawer with production and audit history', async () => {
    routeApi(fetchMock, {
      'GET /charts?': page([chartSummary]),
      'GET /charts/CH-1': { ...chartSummary, productionHistory: [prod({ version: 2 }), prod({ id: 'p-0', version: 1, isCurrent: false })], auditHistory: [aud({ status: 'REJECTED' })] },
    });
    const user = userEvent.setup();
    renderWithProviders(<TeamLeadChartsPage />);
    expect(await screen.findByText('CH-1')).toBeInTheDocument();
    expect(screen.getByText('Rework', { selector: '.MuiChip-label' })).toBeInTheDocument();
    await chooseOption(user, 'Audit status', 'Not audited');
    await waitFor(() => expect(callsTo(fetchMock, '/charts?page=1&pageSize=25&auditState=NOT_AUDITED')).not.toHaveLength(0));
    await user.click(screen.getByText('CH-1'));
    expect(await screen.findByText('Production history')).toBeInTheDocument();
    expect(screen.getByText('v2 (current)')).toBeInTheDocument();
    // v1 appears once as the superseded production version and once as the audited version.
    expect(screen.getAllByText('v1')).toHaveLength(2);
    expect(screen.getByText('2 + 1 = 3')).toBeInTheDocument();
    expectNoProhibitedField();
  });

  it('production page lets the Team Lead cancel un-audited work (with confirmation)', async () => {
    routeApi(fetchMock, { 'GET /production?': page([prod({ status: 'IN_PROGRESS' })]), 'POST /production/p-1/cancel': prod({ status: 'CANCELLED' }) });
    const user = userEvent.setup();
    renderWithProviders(<TeamLeadProductionPage />);
    expect(await screen.findByText('Name c1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actions for CH-1' }));
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Cancel production' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel production' }));
    await waitFor(() => expect(callsTo(fetchMock, '/production/p-1/cancel', 'POST')).toHaveLength(1));
  });

  it('reports: runs role reports with a date range and exports the same report', async () => {
    routeApi(fetchMock, {
      'GET /reports/': (path: string) => ({
        report: path.split('/')[2].split('?')[0], title: 'x', generatedAt: '', filters: { from: null, to: null },
        columns: [{ key: 'coder', label: 'Coder Name' }, { key: 'charts', label: 'Charts', numeric: true }],
        rows: [{ coder: 'Cody', charts: 1234 }],
      }),
    });
    downloadMock.mockResolvedValue('r.pdf');
    const user = userEvent.setup();
    renderWithProviders(<TeamLeadReports />);
    expect(await screen.findByText('1,234')).toBeInTheDocument();
    await chooseOption(user, 'Report', 'Coder Productivity');
    await user.type(screen.getByLabelText('From'), '2026-01-01');
    await waitFor(() => expect(callsTo(fetchMock, '/reports/coder-productivity?from=2026-01-01')).not.toHaveLength(0));
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export PDF' }));
    await waitFor(() => expect(downloadMock).toHaveBeenCalledWith('/reports/coder-productivity/export?from=2026-01-01&format=pdf'));
    const options = within((await (async () => {
      await user.click(screen.getByRole('combobox', { name: 'Report' }));
      return screen.findByRole('listbox');
    })())).getAllByRole('option').map((o) => o.textContent);
    expect(options).not.toContain('Auditor Productivity');
  });

  it('dashboard shows real metrics and an error state with retry', async () => {
    routeApi(fetchMock, {
      'GET /reports/dashboard': { role: 'TEAM_LEAD', metrics: [{ key: 'activeCoders', label: 'Active Coders', value: 4 }] },
      'GET /rework/summary': { open: 0, inProgress: 0, resolved: 0, reaudited: 0, unread: 0, recent: [] },
    });
    fetchMock.mockRejectedValueOnce(new Error('down'));
    const user = userEvent.setup();
    renderWithProviders(<TeamLeadDashboard />);
    expect(await screen.findByText('Could not load dashboard figures.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Active Coders')).toBeInTheDocument();
    expect(screen.getByText('Welcome,', { exact: false })).toBeInTheDocument();
  });
});

describe('Manager setup', () => {
  it('creates a project for a new client and a team', async () => {
    routeApi(fetchMock, {
      'GET /teams': [{ id: 't1', name: 'Team One', teamLead: null }],
      'GET /manager/team-leads': page([]),
      'GET /manager/projects': [],
      'GET /manager/clients': [],
      'POST /manager/clients': { id: 'cl-new', name: 'Acme', isActive: true },
      'POST /manager/projects': { id: 'p-new' },
    });
    const user = userEvent.setup();
    renderWithProviders(<ManagerTeams />);
    await user.click(screen.getByRole('tab', { name: 'Projects' }));
    await user.click(await screen.findByRole('button', { name: 'Create Project' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('New client name'), 'Acme');
    await user.type(within(dialog).getByLabelText('Project name'), 'Cardiology');
    await chooseOption(user, 'Team', 'Team One');
    await user.click(within(dialog).getByRole('button', { name: 'Create Project' }));
    await waitFor(() => expect(callsTo(fetchMock, '/manager/projects', 'POST')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/manager/clients', 'POST')[0][1].body)).toEqual({ name: 'Acme' });
    expect(JSON.parse(callsTo(fetchMock, '/manager/projects', 'POST')[0][1].body)).toEqual({ clientId: 'cl-new', name: 'Cardiology', teamId: 't1' });
  });

  it('assigns an Auditor to a project and removes an assignment after confirmation', async () => {
    routeApi(fetchMock, {
      'GET /teams': [],
      'GET /manager/team-leads': page([]),
      'GET /manager/auditor-assignments': [{ id: 'as-1', assignedAt: '2026-01-01', auditor: person('a1'), project: { id: 'pr', name: 'Cardiology', client: { id: 'cl', name: 'Acme' } } }],
      'GET /manager/projects': [{ id: 'pr', name: 'Cardiology', isActive: true, client: { id: 'cl', name: 'Acme' }, team: null, chartCount: 0, auditorCount: 1 }],
      'GET /manager/auditors': page([{ id: 'a2', fullName: 'Ada', loginName: 'ada', employeeId: 'A2', isActive: true }]),
      'POST /manager/auditor-assignments': { id: 'as-2' },
      'DELETE /manager/auditor-assignments/as-1': { id: 'as-1' },
    });
    const user = userEvent.setup();
    renderWithProviders(<ManagerTeams />);
    await user.click(screen.getByRole('tab', { name: 'Auditor Assignments' }));
    expect(await screen.findByText('Name a1 (E-a1)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Assign Auditor' }));
    await chooseOption(user, 'Auditor', 'Ada (A2)');
    await chooseOption(user, 'Project', 'Cardiology (Acme)');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(callsTo(fetchMock, '/manager/auditor-assignments', 'POST')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText(/will no longer see or audit charts/)).toBeInTheDocument();
    expect(callsTo(fetchMock, '/manager/auditor-assignments/as-1', 'DELETE')).toHaveLength(0);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(callsTo(fetchMock, '/manager/auditor-assignments/as-1', 'DELETE')).toHaveLength(1));
  });
});

describe('Every new workspace page renders without the prohibited field', () => {
  const pages: [string, React.ComponentType][] = [
    ['TL dashboard', TeamLeadDashboard], ['TL productivity', TeamLeadProductivity], ['TL reports', TeamLeadReports], ['TL charts', TeamLeadChartsPage],
    ['TL production', TeamLeadProductionPage], ['TL audits', TeamLeadAuditsPage], ['Coder dashboard', CoderDashboard], ['Coder charts', CoderCharts],
    ['Coder reports', CoderReports], ['Auditor charts', AuditorCharts], ['Auditor reports', AuditorReports], ['Manager dashboard', ManagerDashboard],
    ['Manager teams', ManagerTeams], ['Manager charts', ManagerCharts], ['Manager production', ManagerProduction], ['Manager audits', ManagerAudits],
    ['Manager reports', ManagerReports],
  ];
  it.each(pages)('%s', async (_name, Page) => {
    routeApi(fetchMock, {
      'GET /reports/dashboard': { role: 'MANAGER', metrics: [{ key: 'm', label: 'Metric', value: 1 }] },
      'GET /reports/': { report: 'production-summary', title: 't', generatedAt: '', filters: {}, columns: [{ key: 'status', label: 'Production Status' }], rows: [{ status: 'COMPLETED' }] },
      'GET /charts?': page([chartSummary]),
      'GET /production?': page([prod()]),
      'GET /audits?': page([aud()]),
      'GET /teams': [],
      'GET /manager/team-leads': page([]),
    });
    renderWithProviders(<Page />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    expect(screen.queryByText('Not yet implemented')).not.toBeInTheDocument();
    expectNoProhibitedField();
  });
});
