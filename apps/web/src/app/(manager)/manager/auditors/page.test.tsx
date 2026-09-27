import * as React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@smartcode/ui';
import AuditorsPage from './page';
import { apiFetch } from '@/lib/api-client';

jest.mock('@/lib/api-client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {},
}));

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const sampleAuditor = {
  id: 'aud-1',
  employeeId: 'EMP0300',
  loginName: 'alex.auditor',
  email: 'alex.auditor@smartclues.local',
  fullName: 'Alex Auditor',
  role: 'AUDITOR' as const,
  isActive: true,
  createdAt: '2026-02-01T00:00:00.000Z',
};

const listOf = (rows: (typeof sampleAuditor)[], total = rows.length, page = 1) => ({
  data: rows,
  total,
  page,
  pageSize: 25,
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuditorsPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Routes the mocked apiFetch the way the real endpoints are structured. */
function mockApi(
  list: unknown,
  mutations: Record<string, (options?: RequestInit) => Promise<unknown>> = {},
) {
  mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
    const key = `${options?.method ?? 'GET'} ${path}`;
    if (mutations[key]) return mutations[key](options) as Promise<never>;
    if (path.startsWith('/manager/auditors?')) return Promise.resolve(list) as Promise<never>;
    return Promise.reject(new Error(`Unhandled request in test: ${key}`));
  });
}

const listCalls = () =>
  mockedApiFetch.mock.calls.map(([path]) => path).filter((p) => p.startsWith('/manager/auditors?'));

async function openCreateDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /create auditor/i }));
  return screen.findByRole('dialog');
}

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name = 'Alex Auditor') {
  await user.click(await screen.findByRole('button', { name: `Actions for ${name}` }));
}

describe('AuditorsPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('renders the header, breadcrumb and Auditor table columns', async () => {
    mockApi(listOf([sampleAuditor]));
    renderPage();

    expect(await screen.findByText('Alex Auditor')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Auditors' })).toBeInTheDocument();
    expect(screen.getByText('Manage Auditor accounts.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manager' })).toHaveAttribute('href', '/manager');

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual([
      'Employee ID',
      'Full Name',
      'Login Name',
      'Email',
      'Vendor',
      'Status',
      'Created Date',
      'Actions',
    ]);
    expect(screen.getByText('EMP0300')).toBeInTheDocument();
    expect(screen.getByText('alex.auditor')).toBeInTheDocument();
    expect(screen.getByText('alex.auditor@smartclues.local')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('loads the list from the Manager Auditor endpoint (role-scoped server-side), page 1 by default', async () => {
    mockApi(listOf([sampleAuditor]));
    renderPage();

    await screen.findByText('Alex Auditor');
    expect(listCalls()).toEqual(['/manager/auditors?page=1&pageSize=25']);
    expect(mockedApiFetch.mock.calls.every(([path]) => !path.includes('team-leads') && path !== '/users')).toBe(true);
  });

  it('sends the search term to the API and resets to page 1', async () => {
    mockApi(listOf([sampleAuditor], 60));
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Alex Auditor');
    await user.click(screen.getByRole('button', { name: 'Go to page 2' }));
    await waitFor(() => expect(listCalls()).toContain('/manager/auditors?page=2&pageSize=25'));

    await user.type(screen.getByLabelText('Search'), 'alex');

    await waitFor(() => expect(listCalls()).toContain('/manager/auditors?page=1&pageSize=25&search=alex'));
  });

  it('paginates through results', async () => {
    mockApi(listOf([sampleAuditor], 60));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Showing 1-25 of 60')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go to page 3' }));

    await waitFor(() => expect(listCalls()).toContain('/manager/auditors?page=3&pageSize=25'));
    expect(await screen.findByText('Showing 51-60 of 60')).toBeInTheDocument();
  });

  it('shows the empty state when there are no Auditors', async () => {
    mockApi(listOf([]));
    renderPage();

    expect(await screen.findByText('No Auditors found')).toBeInTheDocument();
    expect(screen.getByText(/create an auditor account/i)).toBeInTheDocument();
    expect(screen.queryByText(/showing/i)).not.toBeInTheDocument();
  });

  it('shows a loading state while the list is being fetched', async () => {
    mockedApiFetch.mockImplementation(() => new Promise<never>(() => {}));
    renderPage();

    expect(await screen.findByText('Loading...')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows an error state and retries on request', async () => {
    mockedApiFetch.mockRejectedValue(new Error('Network down'));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Could not load Auditors. Please try again.')).toBeInTheDocument();

    mockApi(listOf([sampleAuditor]));
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Alex Auditor')).toBeInTheDocument();
  });

  it('validates the Create Auditor form and blocks submission until valid', async () => {
    mockApi(listOf([]));
    const user = userEvent.setup();
    renderPage();

    const dialog = await openCreateDialog(user);
    await user.click(within(dialog).getByRole('button', { name: /create auditor/i }));

    await waitFor(() => {
      expect(within(dialog).getByText('Employee ID is required')).toBeInTheDocument();
    });
    expect(within(dialog).getByText('Full name is required')).toBeInTheDocument();
    expect(within(dialog).getByText('Login name is required')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a valid email address')).toBeInTheDocument();
    expect(within(dialog).getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(within(dialog).getByText('Confirm your password')).toBeInTheDocument();

    expect(mockedApiFetch).not.toHaveBeenCalledWith('/manager/auditors', expect.objectContaining({ method: 'POST' }));
  });

  it('rejects mismatched passwords on the Create Auditor form', async () => {
    mockApi(listOf([]));
    const user = userEvent.setup();
    renderPage();

    const dialog = await openCreateDialog(user);
    await user.type(within(dialog).getByLabelText(/employee id/i), 'EMP0301');
    await user.type(within(dialog).getByLabelText(/full name/i), 'New Auditor');
    await user.type(within(dialog).getByLabelText(/login name/i), 'new.auditor');
    await user.type(within(dialog).getByLabelText(/email/i), 'new.auditor@smartclues.local');
    await user.type(within(dialog).getByLabelText(/^password/i), 'SuperSecret123!');
    await user.type(within(dialog).getByLabelText(/confirm password/i), 'Different123!');
    await user.click(within(dialog).getByRole('button', { name: /create auditor/i }));

    expect(await within(dialog).findByText('Passwords do not match')).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/manager/auditors', expect.objectContaining({ method: 'POST' }));
  });

  it('creates an Auditor and refreshes the list on success', async () => {
    const created = { ...sampleAuditor, id: 'aud-new', fullName: 'New Auditor', loginName: 'new.auditor' };
    let rows: (typeof sampleAuditor)[] = [];
    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (path === '/manager/auditors' && options?.method === 'POST') {
        rows = [created];
        return Promise.resolve(created) as Promise<never>;
      }
      if (path.startsWith('/manager/auditors?')) return Promise.resolve(listOf(rows)) as Promise<never>;
      return Promise.reject(new Error('unhandled'));
    });
    const user = userEvent.setup();
    renderPage();

    const dialog = await openCreateDialog(user);
    await user.type(within(dialog).getByLabelText(/employee id/i), 'EMP0301');
    await user.type(within(dialog).getByLabelText(/full name/i), 'New Auditor');
    await user.type(within(dialog).getByLabelText(/login name/i), 'new.auditor');
    await user.type(within(dialog).getByLabelText(/email/i), 'new.auditor@smartclues.local');
    await user.type(within(dialog).getByLabelText(/^password/i), 'SuperSecret123!');
    await user.type(within(dialog).getByLabelText(/confirm password/i), 'SuperSecret123!');
    await user.click(within(dialog).getByRole('button', { name: /create auditor/i }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith('/manager/auditors', expect.objectContaining({ method: 'POST' }));
    });
    const postCall = mockedApiFetch.mock.calls.find(([p, o]) => p === '/manager/auditors' && o?.method === 'POST');
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      employeeId: 'EMP0301',
      fullName: 'New Auditor',
      loginName: 'new.auditor',
      email: 'new.auditor@smartclues.local',
      password: 'SuperSecret123!',
      confirmPassword: 'SuperSecret123!',
    });
    expect(await screen.findByText('New Auditor')).toBeInTheDocument();
    expect(await screen.findByText('Auditor account created.')).toBeInTheDocument();
  });

  it('shows the backend error when creation is rejected (e.g. duplicate login name)', async () => {
    mockApi(listOf([]), {
      'POST /manager/auditors': () =>
        Promise.reject(new Error('A user with this login name, employee ID, or email already exists')),
    });
    const user = userEvent.setup();
    renderPage();

    const dialog = await openCreateDialog(user);
    await user.type(within(dialog).getByLabelText(/employee id/i), 'EMP0300');
    await user.type(within(dialog).getByLabelText(/full name/i), 'Dup');
    await user.type(within(dialog).getByLabelText(/login name/i), 'alex.auditor');
    await user.type(within(dialog).getByLabelText(/email/i), 'dup@smartclues.local');
    await user.type(within(dialog).getByLabelText(/^password/i), 'SuperSecret123!');
    await user.type(within(dialog).getByLabelText(/confirm password/i), 'SuperSecret123!');
    await user.click(within(dialog).getByRole('button', { name: /create auditor/i }));

    expect(
      await screen.findByText('A user with this login name, employee ID, or email already exists'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('edits an Auditor, sending only employee ID, full name and email', async () => {
    mockApi(listOf([sampleAuditor]), {
      'PATCH /manager/auditors/aud-1': () => Promise.resolve({ ...sampleAuditor, fullName: 'Alex Renamed' }),
    });
    const user = userEvent.setup();
    renderPage();

    await openRowMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'View / Edit' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByLabelText(/login name/i)).toBeDisabled();
    const nameField = within(dialog).getByLabelText(/full name/i);
    await user.clear(nameField);
    await user.type(nameField, 'Alex Renamed');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/manager/auditors/aud-1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
    const patchCall = mockedApiFetch.mock.calls.find(([p]) => p === '/manager/auditors/aud-1');
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      employeeId: 'EMP0300',
      fullName: 'Alex Renamed',
      email: 'alex.auditor@smartclues.local',
    });
    expect(await screen.findByText('Auditor updated.')).toBeInTheDocument();
  });

  it('resets an Auditor\'s password: confirm, then a one-time display of the temporary password', async () => {
    mockApi(listOf([sampleAuditor]), {
      'POST /users/aud-1/reset-password': () =>
        Promise.resolve({ id: 'aud-1', loginName: 'alex.auditor', temporaryPassword: 'Tmp9!xYzAbc' }),
    });
    const user = userEvent.setup();
    renderPage();

    await openRowMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Reset Password' }));
    expect(await screen.findByText(/Generate a new one-time password for Alex Auditor/)).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/users/aud-1/reset-password', expect.anything());

    await user.click(screen.getByRole('button', { name: 'Reset Password' }));
    expect(await screen.findByText('Password reset')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tmp9!xYzAbc')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByText('Password reset')).not.toBeInTheDocument());
  });

  it('changes an Auditor\'s Login Name directly', async () => {
    mockApi(listOf([sampleAuditor]), {
      'PATCH /users/aud-1/login-name': () => Promise.resolve({ id: 'aud-1', loginName: 'alex.renamed' }),
    });
    const user = userEvent.setup();
    renderPage();

    await openRowMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Change Login Name' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Login Name')).toHaveValue('alex.auditor');

    await user.clear(within(dialog).getByLabelText('Login Name'));
    await user.type(within(dialog).getByLabelText('Login Name'), 'alex.renamed');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith('/users/aud-1/login-name', expect.objectContaining({ method: 'PATCH' }));
    });
    const call = mockedApiFetch.mock.calls.find(([p, o]) => p === '/users/aud-1/login-name' && o?.method === 'PATCH');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ loginName: 'alex.renamed' });
    expect(await screen.findByText('Login Name changed to alex.renamed.')).toBeInTheDocument();
  });

  it('asks for confirmation before deactivating, and only calls the API after confirming', async () => {
    mockApi(listOf([sampleAuditor]), {
      'PATCH /users/aud-1/deactivate': () => Promise.resolve({ ...sampleAuditor, isActive: false }),
    });
    const user = userEvent.setup();
    renderPage();

    await openRowMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Deactivate' }));

    expect(await screen.findByText(/will no longer be able to log in/i)).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/users/aud-1/deactivate', expect.anything());

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith('/users/aud-1/deactivate', expect.objectContaining({ method: 'PATCH' }));
    });
    expect(await screen.findByText('Alex Auditor deactivated.')).toBeInTheDocument();
  });

  it('does not deactivate when the confirmation is cancelled', async () => {
    mockApi(listOf([sampleAuditor]));
    const user = userEvent.setup();
    renderPage();

    await openRowMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Deactivate' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByText(/will no longer be able to log in/i)).not.toBeInTheDocument());
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/users/aud-1/deactivate', expect.anything());
  });

  it('activates an inactive Auditor', async () => {
    mockApi(listOf([{ ...sampleAuditor, isActive: false }]), {
      'PATCH /users/aud-1/activate': () => Promise.resolve({ ...sampleAuditor, isActive: true }),
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Inactive')).toBeInTheDocument();
    await openRowMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Activate' }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith('/users/aud-1/activate', expect.objectContaining({ method: 'PATCH' }));
    });
    expect(await screen.findByText('Alex Auditor activated.')).toBeInTheDocument();
  });

  it('never renders a prohibited JCD field, in the table or in either dialog', async () => {
    mockApi(listOf([sampleAuditor]));
    const user = userEvent.setup();
    const { container } = renderPage();

    await screen.findByText('Alex Auditor');
    expect(container.textContent).not.toMatch(/jcd/i);

    const createDialog = await openCreateDialog(user);
    expect(createDialog.textContent).not.toMatch(/jcd/i);
    await user.click(within(createDialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await openRowMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'View / Edit' }));
    expect((await screen.findByRole('dialog')).textContent).not.toMatch(/jcd/i);
    expect(document.body.textContent).not.toMatch(/jcd/i);
  });
});
