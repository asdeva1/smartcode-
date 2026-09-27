import * as React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import VendorDashboard from './page';
import VendorTeamLeads from './team-leads/page';
import VendorAuditors from './auditors/page';
import VendorTeams from './teams/page';
import VendorProduction from './production/page';
import VendorAudits from './audits/page';
import VendorCharts from './charts/page';
import VendorRework from './rework/page';
import VendorReports from './reports/page';
import { apiFetch } from '@/lib/api-client';
import { callsTo, expectNoProhibitedField, page, renderWithProviders, routeApi } from '@/test-utils/render';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/vendor',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/api-client', () => ({ ...jest.requireActual('@/lib/api-client'), apiFetch: jest.fn(), apiDownload: jest.fn() }));
jest.mock('@/features/auth/use-auth', () => ({
  useCurrentUser: () => ({
    user: { id: 'va', employeeId: 'EV1', loginName: 'vendor.ops', fullName: 'Alpha Ops', role: 'VENDOR', teamId: null, vendorId: 'v1', isActive: true, email: 'v@x.local' },
    isLoading: false,
    isError: false,
  }),
}));

const fetchMock = apiFetch as jest.Mock;
const person = (id: string, name: string) => ({ id, fullName: name, employeeId: `E-${id}`, loginName: `${id}.login`, email: `${id}@x.local`, isActive: true });
const me = {
  id: 'v1', name: 'Vendor Alpha', code: 'ALPHA', contactName: null, contactEmail: null, isActive: true, createdAt: '', updatedAt: '', teamLeadCount: 1, auditorCount: 1, accountCount: 1,
  teamLeads: [{ assignmentId: 'as-1', assignedAt: '2026-09-02T00:00:00Z', user: person('tl-1', 'Tara Lead'), team: { id: 't1', name: 'Team Alpha' }, coderCount: 3, projectCount: 0 }],
  auditors: [{ assignmentId: 'as-2', assignedAt: '2026-09-02T00:00:00Z', user: person('a-1', 'Ava Auditor'), team: null, coderCount: 0, projectCount: 2 }],
  accounts: [person('va', 'Alpha Ops')],
};
const dashboard = {
  role: 'VENDOR', vendor: { id: 'v1', name: 'Vendor Alpha', code: 'ALPHA', isActive: true }, period: { key: 'this_month', from: '2026-09-01', to: '2026-09-27' },
  metrics: [
    { key: 'teams', label: 'Total Teams', value: 1 },
    { key: 'teamLeads', label: 'Total Team Leads', value: 1 },
    { key: 'coders', label: 'Active Coders', value: 3 },
    { key: 'auditors', label: 'Total Auditors', value: 1 },
    { key: 'pendingRework', label: 'Pending Rework', value: 2 },
  ],
};
const structure = {
  vendor: { id: 'v1', name: 'Vendor Alpha', code: 'ALPHA', isActive: true },
  teams: [{ id: 't1', name: 'Team Alpha', teamLead: person('tl-1', 'Tara Lead'), coders: [person('c-1', 'Cody Coder')], projects: [{ id: 'p1', name: 'Cardio', isActive: true }] }],
  auditors: [{ ...person('a-1', 'Ava Auditor'), projects: [{ id: 'p1', name: 'Cardio' }] }],
};
const prod = {
  id: 'p-1', chartId: 'CH-100', version: 1, isCurrent: true, pageCount: 10, totalDOS: 2, totalICDs: 4, status: 'COMPLETED', remarks: null, codedDate: '2026-09-25',
  createdAt: '', updatedAt: '', coder: person('c-1', 'Cody Coder'), project: { id: 'p1', name: 'Cardio', client: null }, auditCount: 0,
};
const routes = {
  'GET /vendor/me': me,
  'GET /vendor/dashboard': dashboard,
  'GET /vendor/structure': structure,
  'GET /rework/summary': { open: 2, inProgress: 0, resolved: 0, reaudited: 0, unread: 0, recent: [] },
  'GET /rework?': page([]),
  'GET /production?': page([prod]),
  'GET /audits?': page([]),
  'GET /charts?': page([]),
  'GET /projects/mine': [{ id: 'p1', name: 'Cardio', client: null }],
  'GET /reports/': { report: 'production-summary', title: 't', family: 'INTERNAL_PRODUCTION', familyTitle: 'Internal Production Report', ownerRole: 'TEAM_LEAD', access: 'viewer', generatedAt: '', filters: { from: null, to: null }, columns: [{ key: 'status', label: 'Production Status' }], rows: [{ status: 'COMPLETED' }] },
};

beforeEach(() => fetchMock.mockReset());

describe('Vendor portal', () => {
  it('dashboard shows only its own vendor figures (from the vendor-scoped endpoint) and its rework', async () => {
    routeApi(fetchMock, routes);
    renderWithProviders(<VendorDashboard />);
    expect(await screen.findByText('Vendor Alpha (ALPHA)')).toBeInTheDocument();
    for (const label of ['Total Teams', 'Total Team Leads', 'Active Coders', 'Total Auditors', 'Pending Rework']) expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.getByText(/Current period \(this month\)/)).toBeInTheDocument();
    expect(await screen.findByText('2 pending')).toBeInTheDocument();
    // the organisation dashboard and Manager vendor endpoints are never called
    expect(callsTo(fetchMock, '/reports/dashboard')).toHaveLength(0);
    expect(fetchMock.mock.calls.some(([p]) => String(p).startsWith('/vendors'))).toBe(false);
    expectNoProhibitedField();
  });

  it('lists its Team Leads and Auditors', async () => {
    routeApi(fetchMock, routes);
    const { unmount } = renderWithProviders(<VendorTeamLeads />);
    const tl = (await screen.findByText('Tara Lead')).closest('tr')!;
    expect(within(tl).getByText('Team Alpha')).toBeInTheDocument();
    expect(within(tl).getByText('3')).toBeInTheDocument();
    unmount();
    renderWithProviders(<VendorAuditors />);
    const a = (await screen.findByText('Ava Auditor')).closest('tr')!;
    expect(within(a).getByText('2')).toBeInTheDocument();
  });

  it('shows the vendor team structure', async () => {
    routeApi(fetchMock, routes);
    renderWithProviders(<VendorTeams />);
    const team = await screen.findByRole('region', { name: 'Team Team Alpha' });
    expect(within(team).getByText('Cody Coder')).toBeInTheDocument();
    expect(within(team).getByText('Tara Lead')).toBeInTheDocument();
  });

  it('production is read-only and has no Manager-only vendor filter', async () => {
    routeApi(fetchMock, routes);
    renderWithProviders(<VendorProduction />);
    expect(await screen.findByText('CH-100')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions for CH-100' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Vendor' })).not.toBeInTheDocument();
    expect(callsTo(fetchMock, '/production?page=1&pageSize=25')).toHaveLength(1);
  });

  it.each([
    ['audits', VendorAudits],
    ['charts', VendorCharts],
    ['rework', VendorRework],
    ['reports', VendorReports],
  ])('%s page renders in vendor scope without the prohibited field', async (_n, Page) => {
    routeApi(fetchMock, routes);
    renderWithProviders(<Page />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    expect(screen.queryByRole('combobox', { name: 'Vendor' })).not.toBeInTheDocument();
    expectNoProhibitedField();
  });

  it('vendor reports offer only the vendor-authorised filters (team, Team Lead, auditor, project)', async () => {
    routeApi(fetchMock, routes);
    renderWithProviders(<VendorReports />);
    expect(await screen.findByText('COMPLETED')).toBeInTheDocument();
    for (const name of ['Team', 'Team Lead', 'Auditor', 'Project']) expect(screen.getByRole('combobox', { name })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Vendor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Coder' })).not.toBeInTheDocument();
  });
});
