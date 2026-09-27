import * as React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@smartcode/ui';
import TeamLeadsPage from './page';
import { apiFetch } from '@/lib/api-client';

jest.mock('@/lib/api-client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {},
}));

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const sampleTeamLead = {
  id: 'tl-1',
  employeeId: 'EMP0100',
  loginName: 'jane.doe',
  email: 'jane.doe@smartclues.local',
  fullName: 'Jane Doe',
  role: 'TEAM_LEAD' as const,
  isActive: true,
  createdAt: '2026-01-15T00:00:00.000Z',
  team: null,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <TeamLeadsPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Routes the mocked apiFetch by path prefix, the way the real endpoints are structured. */
function mockApi(handlers: { teamLeads?: any; teams?: any }) {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/manager/team-leads')) return Promise.resolve(handlers.teamLeads);
    if (path.startsWith('/teams')) return Promise.resolve(handlers.teams ?? []);
    return Promise.reject(new Error(`Unhandled path in test: ${path}`));
  });
}

describe('TeamLeadsPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('loads and displays Team Leads in the table', async () => {
    mockApi({
      teamLeads: { data: [sampleTeamLead], total: 1, page: 1, pageSize: 25 },
      teams: [],
    });

    renderPage();

    expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('EMP0100')).toBeInTheDocument();
    expect(screen.getByText('jane.doe')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows the empty state when there are no Team Leads', async () => {
    mockApi({ teamLeads: { data: [], total: 0, page: 1, pageSize: 25 }, teams: [] });

    renderPage();

    expect(await screen.findByText('No Team Leads found')).toBeInTheDocument();
    expect(
      screen.getByText(/create your first team lead account to start building your production team/i),
    ).toBeInTheDocument();
  });

  it('validates the Create Team Lead form and blocks submission until valid', async () => {
    mockApi({ teamLeads: { data: [], total: 0, page: 1, pageSize: 25 }, teams: [] });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /create team lead/i }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: /create team lead/i }));

    await waitFor(() => {
      expect(within(dialog).getByText(/employee id is required/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/full name is required/i)).toBeInTheDocument();
    });
    // Only the list call should have happened - never a POST, since validation blocked it.
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/manager/team-leads', expect.objectContaining({ method: 'POST' }));
  });

  it('creates a Team Lead and refreshes the list on success', async () => {
    mockApi({ teamLeads: { data: [], total: 0, page: 1, pageSize: 25 }, teams: [] });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /create team lead/i }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/employee id/i), 'EMP0200');
    await user.type(within(dialog).getByLabelText(/full name/i), 'New Lead');
    await user.type(within(dialog).getByLabelText(/login name/i), 'new.lead');
    await user.type(within(dialog).getByLabelText(/email/i), 'new.lead@smartclues.local');
    await user.type(within(dialog).getByLabelText(/^password/i), 'SuperSecret123!');
    await user.type(within(dialog).getByLabelText(/confirm password/i), 'SuperSecret123!');

    // After a successful create, the list refetches - simulate that here.
    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (path === '/manager/team-leads' && options?.method === 'POST') {
        return Promise.resolve({ ...sampleTeamLead, id: 'tl-new' });
      }
      if (path.startsWith('/manager/team-leads')) {
        return Promise.resolve({ data: [{ ...sampleTeamLead, id: 'tl-new', fullName: 'New Lead' }], total: 1, page: 1, pageSize: 25 });
      }
      if (path.startsWith('/teams')) return Promise.resolve([]);
      return Promise.reject(new Error('unhandled'));
    });

    await user.click(within(dialog).getByRole('button', { name: /create team lead/i }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/manager/team-leads',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    // The body must match CreateTeamLeadDto exactly - the API rejects
    // undeclared fields (forbidNonWhitelisted), so confirmPassword and
    // teamId both have to be fields the DTO declares.
    const postCall = mockedApiFetch.mock.calls.find(
      ([path, options]) => path === '/manager/team-leads' && options?.method === 'POST',
    );
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      employeeId: 'EMP0200',
      fullName: 'New Lead',
      loginName: 'new.lead',
      email: 'new.lead@smartclues.local',
      password: 'SuperSecret123!',
      confirmPassword: 'SuperSecret123!',
      teamId: null,
    });
    expect(await screen.findByText('New Lead')).toBeInTheDocument();
  });

  it('resets a Team Lead\'s password: confirm, then a one-time display of the temporary password', async () => {
    mockApi({
      teamLeads: { data: [sampleTeamLead], total: 1, page: 1, pageSize: 25 },
      teams: [],
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Jane Doe');
    await user.click(screen.getByRole('button', { name: '' })); // row action menu icon button
    await user.click(await screen.findByText('Reset Password'));
    expect(await screen.findByText(/Generate a new one-time password for Jane Doe/)).toBeInTheDocument();

    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (path === '/users/tl-1/reset-password' && options?.method === 'POST') {
        return Promise.resolve({ id: 'tl-1', loginName: 'jane.doe', temporaryPassword: 'Tmp9!xYzAbc' });
      }
      return Promise.reject(new Error(`Unhandled path in test: ${path}`));
    });

    await user.click(screen.getByRole('button', { name: 'Reset Password' }));
    expect(await screen.findByText('Password reset')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tmp9!xYzAbc')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByText('Password reset')).not.toBeInTheDocument());
  });

  it('changes a Team Lead\'s Login Name directly (Manager-only, no approval needed)', async () => {
    mockApi({
      teamLeads: { data: [sampleTeamLead], total: 1, page: 1, pageSize: 25 },
      teams: [],
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Jane Doe');
    await user.click(screen.getByRole('button', { name: '' }));
    await user.click(await screen.findByText('Change Login Name'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Login Name')).toHaveValue('jane.doe');

    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (path === '/users/tl-1/login-name' && options?.method === 'PATCH') {
        return Promise.resolve({ id: 'tl-1', loginName: 'jane.renamed' });
      }
      if (path.startsWith('/manager/team-leads')) {
        return Promise.resolve({ data: [{ ...sampleTeamLead, loginName: 'jane.renamed' }], total: 1, page: 1, pageSize: 25 });
      }
      return Promise.resolve([]);
    });

    await user.clear(within(dialog).getByLabelText('Login Name'));
    await user.type(within(dialog).getByLabelText('Login Name'), 'jane.renamed');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith('/users/tl-1/login-name', expect.objectContaining({ method: 'PATCH' }));
    });
    expect(JSON.parse(String(mockedApiFetch.mock.calls.find(([p]) => p === '/users/tl-1/login-name')?.[1]?.body))).toEqual({
      loginName: 'jane.renamed',
    });
    expect(await screen.findByText('Login Name changed to jane.renamed.')).toBeInTheDocument();
  });

  it('asks for confirmation before deactivating, and only calls the API after confirming', async () => {
    mockApi({
      teamLeads: { data: [sampleTeamLead], total: 1, page: 1, pageSize: 25 },
      teams: [],
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Jane Doe');
    await user.click(screen.getByRole('button', { name: '' })); // row action menu icon button
    await user.click(await screen.findByText('Deactivate'));

    const confirmDialog = await screen.findByText(/will no longer be able to log in/i);
    expect(confirmDialog).toBeInTheDocument();
    // Not yet called - confirmation hasn't been given.
    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/deactivate'),
      expect.anything(),
    );

    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/users/tl-1/deactivate') return Promise.resolve({ ...sampleTeamLead, isActive: false });
      if (path.startsWith('/manager/team-leads')) {
        return Promise.resolve({ data: [{ ...sampleTeamLead, isActive: false }], total: 1, page: 1, pageSize: 25 });
      }
      return Promise.resolve([]);
    });

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith('/users/tl-1/deactivate', expect.objectContaining({ method: 'PATCH' }));
    });
  });
});
