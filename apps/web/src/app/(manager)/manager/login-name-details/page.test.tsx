import * as React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginNameDetailsPage from './page';
import { apiFetch } from '@/lib/api-client';
import { callsTo, chooseOption, page, renderWithProviders, routeApi } from '@/test-utils/render';

jest.mock('@/lib/api-client', () => ({
  ...jest.requireActual('@/lib/api-client'),
  apiFetch: jest.fn(),
}));

const fetchMock = apiFetch as jest.Mock;

const person = {
  id: 'coder-1',
  fullName: 'Cody Coder',
  employeeId: 'EMP100',
  loginName: 'cody.coder',
};

const activeAllocation = {
  id: 'alloc-2',
  loginName: 'cody.coder',
  employeeId: 'EMP100',
  status: 'ACTIVE',
  allocatedAt: '2026-06-01T00:00:00.000Z',
  deallocatedAt: null,
  allocatedBy: { id: 'mgr-1', fullName: 'Mona Manager', employeeId: 'EMP001', loginName: 'mona' },
  deallocatedBy: null,
  reason: null,
  user: {
    id: 'coder-1',
    fullName: 'Cody Coder',
    employeeId: 'EMP100',
    loginName: 'cody.coder',
    role: 'CODER',
    isActive: true,
    vendor: { id: 'v-1', name: 'Acme Vendor' },
    team: { id: 't-1', name: 'Team One' },
    teamLead: { id: 'tl-1', fullName: 'Tara Lead', loginName: 'tara' },
  },
};

// A Login Name's history is scoped to that exact string (getByLoginName filters
// on `loginName`), so a prior holder of "cody.coder" shares the same loginName
// but is a different employee/user - not a different loginName string.
const historyRow = {
  ...activeAllocation,
  id: 'alloc-1',
  employeeId: 'EMP050',
  status: 'REALLOCATED',
  allocatedAt: '2026-01-01T00:00:00.000Z',
  deallocatedAt: '2026-06-01T00:00:00.000Z',
  user: {
    ...activeAllocation.user,
    id: 'former-user-1',
    fullName: 'Former Holder',
    employeeId: 'EMP050',
  },
};

describe('Manager - Login Name Details page', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('lists Login Name allocations, defaulting to the ACTIVE directory', async () => {
    routeApi(fetchMock, { 'GET /manager/login-name-allocations?': page([activeAllocation]) });
    renderWithProviders(<LoginNameDetailsPage />);

    expect(await screen.findByText('cody.coder')).toBeInTheDocument();
    expect(screen.getByText('EMP100')).toBeInTheDocument();
    expect(screen.getByText('Cody Coder')).toBeInTheDocument();
    expect(screen.getByText('Acme Vendor')).toBeInTheDocument();
    expect(screen.getByText('Team One')).toBeInTheDocument();
    expect(callsTo(fetchMock, '/manager/login-name-allocations?', 'GET')[0][0]).toContain('status=ACTIVE');
  });

  it('searches server-side by Login Name / Employee ID / Name / Email', async () => {
    routeApi(fetchMock, { 'GET /manager/login-name-allocations?': page([activeAllocation]) });
    const user = userEvent.setup();
    renderWithProviders(<LoginNameDetailsPage />);
    await screen.findByText('cody.coder');

    await user.type(screen.getByLabelText('Search'), 'cody');
    await waitFor(() =>
      expect(callsTo(fetchMock, '/manager/login-name-allocations?', 'GET').some(([p]) => (p as string).includes('search=cody'))).toBe(true),
    );
  });

  it('filters by status and by role', async () => {
    routeApi(fetchMock, { 'GET /manager/login-name-allocations?': page([]) });
    const user = userEvent.setup();
    renderWithProviders(<LoginNameDetailsPage />);
    await screen.findByText('No Login Names found');

    await chooseOption(user, 'Status', 'All statuses');
    await waitFor(() =>
      expect(callsTo(fetchMock, '/manager/login-name-allocations?', 'GET').some(([p]) => (p as string).includes('status=all'))).toBe(true),
    );

    await chooseOption(user, 'Role', 'Coder');
    await waitFor(() =>
      expect(callsTo(fetchMock, '/manager/login-name-allocations?', 'GET').some(([p]) => (p as string).includes('role=CODER'))).toBe(true),
    );
  });

  it('shows current allocation and complete history on row click', async () => {
    routeApi(fetchMock, {
      'GET /manager/login-name-allocations?': page([activeAllocation]),
      'GET /manager/login-name-allocations/cody.coder': { loginName: 'cody.coder', current: activeAllocation, history: [historyRow, activeAllocation] },
    });
    const user = userEvent.setup();
    renderWithProviders(<LoginNameDetailsPage />);
    await user.click(await screen.findByText('cody.coder'));

    expect(await screen.findByText('Current Allocation')).toBeInTheDocument();
    expect(screen.getByText('Allocation History')).toBeInTheDocument();
    expect(screen.getByText('Former Holder')).toBeInTheDocument();
    expect(screen.getByText('EMP050')).toBeInTheDocument();
  });

  it('shows a message when a Login Name has no current active allocation', async () => {
    routeApi(fetchMock, {
      'GET /manager/login-name-allocations?': page([{ ...activeAllocation, status: 'DEACTIVATED' }]),
      'GET /manager/login-name-allocations/cody.coder': { loginName: 'cody.coder', current: null, history: [historyRow] },
    });
    const user = userEvent.setup();
    renderWithProviders(<LoginNameDetailsPage />);
    await user.click(await screen.findByText('cody.coder'));

    expect(await screen.findByText('This Login Name has no current active allocation.')).toBeInTheDocument();
  });

  it('paginates the results', async () => {
    routeApi(fetchMock, { 'GET /manager/login-name-allocations?': page([activeAllocation], 60, 1) });
    renderWithProviders(<LoginNameDetailsPage />);
    await screen.findByText('cody.coder');

    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });

  it('shows a loading state, then an error state with retry', async () => {
    let reject = true;
    fetchMock.mockImplementation(() => (reject ? Promise.reject(new Error('boom')) : Promise.resolve(page([activeAllocation]))));
    const user = userEvent.setup();
    renderWithProviders(<LoginNameDetailsPage />);

    expect(await screen.findByText('Could not load Login Name allocations. Please try again.')).toBeInTheDocument();
    reject = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('cody.coder')).toBeInTheDocument();
  });
});
