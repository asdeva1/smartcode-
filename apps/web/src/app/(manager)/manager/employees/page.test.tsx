import * as React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmployeeDirectoryPage from './page';
import { apiFetch } from '@/lib/api-client';
import { callsTo, chooseOption, page, renderWithProviders, routeApi } from '@/test-utils/render';

jest.mock('@/lib/api-client', () => ({
  ...jest.requireActual('@/lib/api-client'),
  apiFetch: jest.fn(),
}));

const fetchMock = apiFetch as jest.Mock;

const employee = {
  id: 'coder-1',
  employeeId: 'EMP100',
  fullName: 'Cody Coder',
  loginName: 'cody.coder',
  email: 'cody@x.local',
  role: 'CODER',
  isActive: true,
  vendor: { id: 'v-1', name: 'Acme Vendor' },
  team: { id: 't-1', name: 'Team One' },
  teamLead: { id: 'tl-1', fullName: 'Tara Lead', loginName: 'tara' },
  assignedProjects: [{ id: 'p-1', name: 'Project Centauri' }],
  createdAt: '2026-01-15T00:00:00.000Z',
};

const employeeDetail = {
  ...employee,
  loginNameHistory: [
    { id: 'alloc-1', loginName: 'old.codyname', status: 'REALLOCATED', allocatedAt: '2026-01-01T00:00:00.000Z', deallocatedAt: '2026-06-01T00:00:00.000Z' },
    { id: 'alloc-2', loginName: 'cody.coder', status: 'ACTIVE', allocatedAt: '2026-06-01T00:00:00.000Z', deallocatedAt: null },
  ],
};

describe('Manager - Employee Directory page', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('lists employees with their identity, role, and org placement, but never a password/token field', async () => {
    routeApi(fetchMock, { 'GET /manager/employees?': page([employee]) });
    renderWithProviders(<EmployeeDirectoryPage />);

    expect(await screen.findByText('EMP100')).toBeInTheDocument();
    expect(screen.getByText('Cody Coder')).toBeInTheDocument();
    expect(screen.getByText('cody.coder')).toBeInTheDocument();
    expect(screen.getByText('cody@x.local')).toBeInTheDocument();
    expect(screen.getByText('Acme Vendor')).toBeInTheDocument();
    expect(screen.getByText('Team One')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/passwordHash|resetToken|accessToken|refreshToken/i);
  });

  it('searches server-side by EMP-ID / Name / Login Name / Email', async () => {
    routeApi(fetchMock, { 'GET /manager/employees?': page([employee]) });
    const user = userEvent.setup();
    renderWithProviders(<EmployeeDirectoryPage />);
    await screen.findByText('EMP100');

    await user.type(screen.getByLabelText('Search'), 'cody');
    await waitFor(() => expect(callsTo(fetchMock, '/manager/employees?', 'GET').some(([p]) => (p as string).includes('search=cody'))).toBe(true));
  });

  it('filters server-side by role and by active/inactive status', async () => {
    routeApi(fetchMock, { 'GET /manager/employees?': page([]) });
    const user = userEvent.setup();
    renderWithProviders(<EmployeeDirectoryPage />);
    await screen.findByText('No employees found');

    await chooseOption(user, 'Role', 'Coder');
    await waitFor(() => expect(callsTo(fetchMock, '/manager/employees?', 'GET').some(([p]) => (p as string).includes('role=CODER'))).toBe(true));

    await chooseOption(user, 'Status', 'Inactive');
    await waitFor(() => expect(callsTo(fetchMock, '/manager/employees?', 'GET').some(([p]) => (p as string).includes('status=inactive'))).toBe(true));
  });

  it('paginates the results', async () => {
    routeApi(fetchMock, { 'GET /manager/employees?': page([employee], 60, 1) });
    renderWithProviders(<EmployeeDirectoryPage />);
    await screen.findByText('EMP100');

    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });

  it('opens employee details on row click: Identity, Account, Organization, and Login Name history', async () => {
    routeApi(fetchMock, {
      'GET /manager/employees?': page([employee]),
      'GET /manager/employees/coder-1': employeeDetail,
    });
    const user = userEvent.setup();
    renderWithProviders(<EmployeeDirectoryPage />);
    await user.click(await screen.findByText('EMP100'));

    expect(await screen.findByText('Identity')).toBeInTheDocument();
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByText('Login Name Allocation History')).toBeInTheDocument();
    expect(screen.getByText('old.codyname')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/passwordHash|resetToken|accessToken|refreshToken/i);
  });

  it('shows a loading state, then an error state with retry', async () => {
    let reject = true;
    fetchMock.mockImplementation(() => (reject ? Promise.reject(new Error('boom')) : Promise.resolve(page([employee]))));
    const user = userEvent.setup();
    renderWithProviders(<EmployeeDirectoryPage />);

    expect(await screen.findByText('Could not load the Employee Directory. Please try again.')).toBeInTheDocument();
    reject = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('EMP100')).toBeInTheDocument();
  });

  it('shows an error state when an employee\'s detail fails to load', async () => {
    routeApi(fetchMock, {
      'GET /manager/employees?': page([employee]),
      'GET /manager/employees/coder-1': () => Promise.reject(new Error('boom')),
    });
    const user = userEvent.setup();
    renderWithProviders(<EmployeeDirectoryPage />);
    await user.click(await screen.findByText('EMP100'));

    expect(await screen.findByText('Could not load this employee\'s details.')).toBeInTheDocument();
  });
});
