import * as React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewProductionPage from './new/page';
import MyProductionPage from './page';
import { apiDownload, apiFetch } from '@/lib/api-client';
import { callsTo, expectNoProhibitedField, page, renderWithProviders, routeApi } from '@/test-utils/render';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  usePathname: () => '/coder/production',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/api-client', () => ({
  ...jest.requireActual('@/lib/api-client'),
  apiFetch: jest.fn(),
  apiDownload: jest.fn(),
}));
jest.mock('@/features/auth/use-auth', () => ({
  useCurrentUser: () => ({
    user: { id: 'coder-1', employeeId: 'EMP500', loginName: 'cody.c', fullName: 'Cody Coder', role: 'CODER', teamId: 't', isActive: true, email: 'c@x.local' },
    isLoading: false,
    isError: false,
  }),
}));

const fetchMock = apiFetch as jest.Mock;
const downloadMock = apiDownload as jest.Mock;
const PROJECT = '33333333-3333-4333-8333-333333333333';
const projects = [{ id: PROJECT, name: 'Cardiology', client: { id: 'cl', name: 'Acme Health' } }];

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'p-1', chartId: 'CH-100', version: 1, isCurrent: true, pageCount: 12, totalDOS: 2, totalICDs: 5, status: 'COMPLETED',
  remarks: null, codedDate: '2026-01-10', createdAt: '', updatedAt: '', auditCount: 0,
  coder: { id: 'coder-1', fullName: 'Cody Coder', employeeId: 'EMP500', loginName: 'cody.c' },
  project: { id: PROJECT, name: 'Cardiology', client: null },
  ...over,
});

describe('Coder - Add Production', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    push.mockReset();
  });

  it('shows the coder identity read-only from the login, never as editable inputs', async () => {
    routeApi(fetchMock, { 'GET /projects/mine': projects });
    renderWithProviders(<NewProductionPage />);
    expect(screen.getByLabelText('Coder Name')).toHaveValue('Cody Coder');
    expect(screen.getByLabelText('Coder Name')).toBeDisabled();
    expect(screen.getByLabelText('Employee ID')).toHaveValue('EMP500');
    expect(screen.getByLabelText('Employee ID')).toBeDisabled();
    expect(screen.getByLabelText('Login Name')).toBeDisabled();
    expectNoProhibitedField();
  });

  it('validates Chart ID, numbers and negatives before calling the API', async () => {
    routeApi(fetchMock, { 'GET /projects/mine': projects });
    const user = userEvent.setup();
    renderWithProviders(<NewProductionPage />);
    await user.type(screen.getByLabelText('Chart ID'), 'bad id!');
    await user.type(screen.getByLabelText('Page Count'), '0');
    await user.type(screen.getByLabelText('Total ICDs'), '-3');
    await user.click(screen.getByRole('button', { name: 'Save Production' }));
    expect(await screen.findByText(/Chart ID may only contain/)).toBeInTheDocument();
    expect(screen.getByText('Page count must be at least 1')).toBeInTheDocument();
    expect(screen.getByText('Total ICDs cannot be negative')).toBeInTheDocument();
    expect(screen.getByText('Total DOS must be a number')).toBeInTheDocument();
    expect(callsTo(fetchMock, '/production', 'POST')).toHaveLength(0);
  });

  it('submits production without any identity field and returns to My Production', async () => {
    routeApi(fetchMock, { 'GET /projects/mine': projects, 'POST /production': entry() });
    const user = userEvent.setup();
    renderWithProviders(<NewProductionPage />);
    await user.type(screen.getByLabelText('Chart ID'), 'CH-100');
    await user.click(await screen.findByRole('combobox', { name: 'Project' }));
    await user.click(await screen.findByRole('option', { name: 'Cardiology (Acme Health)' }));
    await user.type(screen.getByLabelText('Page Count'), '12');
    await user.type(screen.getByLabelText('Total ICDs'), '5');
    await user.type(screen.getByLabelText('Total DOS'), '2');
    await user.clear(screen.getByLabelText('Coded Date'));
    await user.type(screen.getByLabelText('Coded Date'), '2026-01-10');
    await user.click(screen.getByRole('button', { name: 'Save Production' }));

    await waitFor(() => expect(callsTo(fetchMock, '/production', 'POST')).toHaveLength(1));
    const body = JSON.parse(callsTo(fetchMock, '/production', 'POST')[0][1].body);
    expect(body).toEqual({ chartId: 'CH-100', projectId: PROJECT, pageCount: 12, totalICDs: 5, totalDOS: 2, status: 'COMPLETED', codedDate: '2026-01-10' });
    for (const identity of ['coderId', 'coderName', 'employeeId', 'loginName']) expect(body).not.toHaveProperty(identity);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/coder/production'));
  });

  it('shows the backend reason when a chart already has production (duplicate rule)', async () => {
    routeApi(fetchMock, {
      'GET /projects/mine': projects,
      'POST /production': () => {
        throw new Error('Production already exists for chart CH-100 (version 1, COMPLETED). Edit it or initiate rework instead.');
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<NewProductionPage />);
    await user.type(screen.getByLabelText('Chart ID'), 'CH-100');
    await user.type(screen.getByLabelText('Page Count'), '1');
    await user.type(screen.getByLabelText('Total ICDs'), '1');
    await user.type(screen.getByLabelText('Total DOS'), '1');
    await user.click(screen.getByRole('button', { name: 'Save Production' }));
    expect(await screen.findByText(/Production already exists for chart CH-100/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('warns when the team has no project to enter charts against', async () => {
    routeApi(fetchMock, { 'GET /projects/mine': [] });
    renderWithProviders(<NewProductionPage />);
    expect(await screen.findByText(/Your team has no active project yet/)).toBeInTheDocument();
  });
});

describe('Coder - My Production', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    downloadMock.mockReset();
  });

  it('lists own production and never shows a coder column (it is always the caller)', async () => {
    routeApi(fetchMock, { 'GET /production?': page([entry()]) });
    renderWithProviders(<MyProductionPage />);
    expect(await screen.findByText('CH-100')).toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).not.toContain('Coder');
    expect(headers).toEqual(expect.arrayContaining(['Chart ID', 'Pages', 'Total ICDs', 'Total DOS', 'Status', 'Coded Date']));
    expectNoProhibitedField();
  });

  it('offers Edit only for editable versions; COMPLETED records can only be sent to rework (after confirmation)', async () => {
    routeApi(fetchMock, {
      'GET /production?': page([entry(), entry({ id: 'p-2', chartId: 'CH-200', status: 'IN_PROGRESS' })]),
      'POST /production/p-1/rework': entry({ id: 'p-3', version: 2, status: 'REWORK' }),
    });
    const user = userEvent.setup();
    renderWithProviders(<MyProductionPage />);

    await user.click(await screen.findByRole('button', { name: 'Actions for CH-200' }));
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Send to rework' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Actions for CH-100' }));
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Cancel production' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Send to rework' }));
    expect(await screen.findByText(/stays in history unchanged/)).toBeInTheDocument();
    expect(callsTo(fetchMock, '/production/p-1/rework', 'POST')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Send to rework' }));
    await waitFor(() => expect(callsTo(fetchMock, '/production/p-1/rework', 'POST')).toHaveLength(1));
  });

  it('edits an in-progress record with only allowed status transitions', async () => {
    const inProgress = entry({ id: 'p-2', chartId: 'CH-200', status: 'IN_PROGRESS' });
    routeApi(fetchMock, { 'GET /production?': page([inProgress]), 'PATCH /production/p-2': { ...inProgress, status: 'COMPLETED' } });
    const user = userEvent.setup();
    renderWithProviders(<MyProductionPage />);
    await user.click(await screen.findByRole('button', { name: 'Actions for CH-200' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: 'Status' }));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['In Progress', 'Completed']);
    await user.click(screen.getByRole('option', { name: 'Completed' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(callsTo(fetchMock, '/production/p-2', 'PATCH')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/production/p-2', 'PATCH')[0][1].body)).toMatchObject({ status: 'COMPLETED', pageCount: 12 });
  });

  it('filters by status and exports with the same filters', async () => {
    routeApi(fetchMock, { 'GET /production?': page([entry()]) });
    downloadMock.mockResolvedValue('x.xlsx');
    const user = userEvent.setup();
    renderWithProviders(<MyProductionPage />);
    await screen.findByText('CH-100');
    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'Completed' }));
    await waitFor(() => expect(callsTo(fetchMock, '/production?page=1&pageSize=25&status=COMPLETED')).not.toHaveLength(0));
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export Excel' }));
    await waitFor(() => expect(downloadMock).toHaveBeenCalledWith('/production/export?status=COMPLETED&format=xlsx'));
  });

  it('shows empty and error states', async () => {
    routeApi(fetchMock, { 'GET /production?': page([]) });
    const r = renderWithProviders(<MyProductionPage />);
    expect(await screen.findByText('No production records found')).toBeInTheDocument();
    r.unmount();
    fetchMock.mockRejectedValue(new Error('x'));
    renderWithProviders(<MyProductionPage />);
    expect(await screen.findByText('Could not load production. Please try again.')).toBeInTheDocument();
  });
});
