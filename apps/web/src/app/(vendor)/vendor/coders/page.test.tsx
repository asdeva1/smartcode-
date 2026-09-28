import * as React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CodersPage from './page';
import { apiFetch } from '@/lib/api-client';
import { callsTo, page, renderWithProviders, routeApi } from '@/test-utils/render';

jest.mock('@/lib/api-client', () => ({
  ...jest.requireActual('@/lib/api-client'),
  apiFetch: jest.fn(),
}));

const fetchMock = apiFetch as jest.Mock;

const coderNoTeamLead = {
  id: 'c-1', employeeId: 'EMP200', loginName: 'newcoder', email: 'nc@x.local', fullName: 'New Coder',
  role: 'CODER', isActive: true, createdAt: '2026-01-02T00:00:00.000Z', lastLoginAt: null, teamLead: null, projects: [],
};
const coderWithTeamLead = {
  ...coderNoTeamLead, id: 'c-2', loginName: 'assigned', fullName: 'Assigned Coder',
  teamLead: { id: 'tl-1', fullName: 'TL One', employeeId: 'ETL1', loginName: 'tl.one' },
  projects: [{ id: 'p-1', name: 'Project 001' }],
};

describe('Vendor Portal - Coders page', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('renders the vendor\'s own Coders, including whether a Team Lead has been assigned yet', async () => {
    routeApi(fetchMock, { 'GET /vendor/coders?': page([coderNoTeamLead, coderWithTeamLead]) });
    renderWithProviders(<CodersPage />);
    expect(await screen.findByText('New Coder')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Coders' })).toBeInTheDocument();
    expect(screen.getByText('Assigned Coder')).toBeInTheDocument();
    expect(screen.getByText('TL One')).toBeInTheDocument();
    // No Team Lead assigned to the vendor yet -> shown as a dash, not blank/undefined.
    const row = screen.getByText('New Coder').closest('tr')!;
    expect(within(row).getByText('—')).toBeInTheDocument();
  });

  it('has no Import/Export actions (Vendor Portal scope only supports create/view/edit/activate/deactivate)', async () => {
    routeApi(fetchMock, { 'GET /vendor/coders?': page([]) });
    renderWithProviders(<CodersPage />);
    await screen.findByText('No Coders found');
    expect(screen.queryByRole('button', { name: 'Import CSV' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Coder' })).toBeInTheDocument();
  });

  it('creates a Coder against the vendor-scoped endpoint (no vendorId field is ever sent)', async () => {
    routeApi(fetchMock, { 'GET /vendor/coders?': page([]), 'POST /vendor/coders': { ...coderNoTeamLead, id: 'new' } });
    const user = userEvent.setup();
    renderWithProviders(<CodersPage />);
    await user.click(await screen.findByRole('button', { name: 'Create Coder' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/employee id/i), 'EMP300');
    await user.type(within(dialog).getByLabelText(/full name/i), 'Third Coder');
    await user.type(within(dialog).getByLabelText(/login name/i), 'third.coder');
    await user.type(within(dialog).getByLabelText(/email/i), 'third@x.local');
    await user.type(within(dialog).getByLabelText(/^password/i), 'Password1!');
    await user.type(within(dialog).getByLabelText(/confirm password/i), 'Password1!');
    await user.click(within(dialog).getByRole('button', { name: 'Create Coder' }));
    await waitFor(() => expect(callsTo(fetchMock, '/vendor/coders', 'POST')).toHaveLength(1));
    const body = JSON.parse(callsTo(fetchMock, '/vendor/coders', 'POST')[0][1].body);
    expect(body).not.toHaveProperty('vendorId');
    expect(body).toMatchObject({ employeeId: 'EMP300', loginName: 'third.coder' });
    expect(await screen.findByText('Coder account created.')).toBeInTheDocument();
  });

  it('views a Coder with its assigned Team Lead and Project(s)', async () => {
    routeApi(fetchMock, {
      'GET /vendor/coders?': page([coderWithTeamLead]),
      'GET /vendor/coders/c-2': { ...coderWithTeamLead, stats: { charts: 3, completed: 2, inProgress: 1, rework: 0, pages: 30, dos: 4, icds: 12 } },
    });
    const user = userEvent.setup();
    renderWithProviders(<CodersPage />);
    await user.click(await screen.findByRole('button', { name: 'Actions for Assigned Coder' }));
    await user.click(screen.getByRole('menuitem', { name: 'View' }));
    expect(await screen.findByText('Coder details')).toBeInTheDocument();
    const drawer = screen.getByText('Coder details').closest('.MuiDrawer-paper') as HTMLElement;
    expect(within(drawer).getByText('TL One')).toBeInTheDocument();
    expect(within(drawer).getByText('Project 001')).toBeInTheDocument();
  });

  it('has no Login Name change action (Vendor is not authorized to request that)', async () => {
    routeApi(fetchMock, { 'GET /vendor/coders?': page([coderWithTeamLead]) });
    const user = userEvent.setup();
    renderWithProviders(<CodersPage />);
    await user.click(await screen.findByRole('button', { name: 'Actions for Assigned Coder' }));
    expect(screen.queryByRole('menuitem', { name: 'Request Login Name Change' })).not.toBeInTheDocument();
  });

  it('requests a Coder\'s password reset - never resets directly, never shows a password (Phase 8)', async () => {
    routeApi(fetchMock, {
      'GET /vendor/coders?': page([coderWithTeamLead]),
      'POST /users/c-2/reset-password-request': { id: 'req-1', status: 'PENDING' },
    });
    const user = userEvent.setup();
    renderWithProviders(<CodersPage />);
    await user.click(await screen.findByRole('button', { name: 'Actions for Assigned Coder' }));
    await user.click(screen.getByRole('menuitem', { name: 'Request Password Reset' }));
    expect(await screen.findByText(/A Manager will review this/)).toBeInTheDocument();
    expect(callsTo(fetchMock, '/users/c-2/reset-password-request', 'POST')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Request Password Reset' }));
    await waitFor(() => expect(callsTo(fetchMock, '/users/c-2/reset-password-request', 'POST')).toHaveLength(1));
    expect(await screen.findByText('Password reset requested - awaiting Manager approval.')).toBeInTheDocument();
    // Vendor never resets directly, and no password is ever displayed.
    expect(callsTo(fetchMock, '/users/c-2/reset-password', 'POST').filter(([p]) => p === '/users/c-2/reset-password')).toHaveLength(0);
  });

  it('deactivates through the shared /users endpoint, scoped server-side to the caller\'s own vendor', async () => {
    routeApi(fetchMock, {
      'GET /vendor/coders?': page([coderWithTeamLead]),
      'PATCH /users/c-2/deactivate': { ...coderWithTeamLead, isActive: false },
    });
    const user = userEvent.setup();
    renderWithProviders(<CodersPage />);
    await user.click(await screen.findByRole('button', { name: 'Actions for Assigned Coder' }));
    await user.click(screen.getByRole('menuitem', { name: 'Deactivate' }));
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(callsTo(fetchMock, '/users/c-2/deactivate', 'PATCH')).toHaveLength(1));
  });
});
