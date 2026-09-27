import * as React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VendorsPage from './page';
import VendorDetailPage from './[id]/page';
import ManagerDashboard from '../page';
import ManagerProduction from '../production/page';
import { apiFetch } from '@/lib/api-client';
import { callsTo, chooseOption, expectNoProhibitedField, page, renderWithProviders, routeApi } from '@/test-utils/render';

const push = jest.fn();
const V = '11111111-1111-4111-8111-111111111111';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  usePathname: () => '/manager/vendors',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
}));
jest.mock('@/lib/api-client', () => ({ ...jest.requireActual('@/lib/api-client'), apiFetch: jest.fn(), apiDownload: jest.fn() }));

const fetchMock = apiFetch as jest.Mock;
const vendor = (over: Record<string, unknown> = {}) => ({
  id: V, name: 'Vendor Alpha', code: 'ALPHA', contactName: 'Ann', contactEmail: 'ops@alpha.test', isActive: true,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', teamLeadCount: 1, auditorCount: 2, accountCount: 1, ...over,
});
const person = (id: string, name: string) => ({ id, fullName: name, employeeId: `E-${id}`, loginName: `${id}.login`, email: `${id}@x.local`, isActive: true });
const detail = (over: Record<string, unknown> = {}) => ({
  ...vendor(),
  teamLeads: [{ assignmentId: 'as-1', assignedAt: '2026-09-02T00:00:00Z', user: person('tl-1', 'Tara Lead'), team: { id: 't1', name: 'Team Alpha' }, coderCount: 3, projectCount: 0 }],
  auditors: [],
  accounts: [person('va-1', 'Alpha Ops')],
  ...over,
});
const dashboard = { role: 'VENDOR', vendor: { id: V, name: 'Vendor Alpha', code: 'ALPHA', isActive: true }, period: { key: 'this_month', from: '2026-09-01', to: '2026-09-27' }, metrics: [{ key: 'pendingRework', label: 'Pending Rework', value: 2 }] };

beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
});

describe('Manager - Vendors page', () => {
  it('lists vendors with their counts and status, and never shows the prohibited field', async () => {
    routeApi(fetchMock, { 'GET /vendors?': page([vendor(), vendor({ id: 'v2', name: 'Vendor Beta', code: 'BETA', isActive: false, contactName: null, contactEmail: null })]) });
    renderWithProviders(<VendorsPage />);
    expect(await screen.findByText('Vendor Beta')).toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Code', 'Vendor', 'Contact', 'Team Leads', 'Auditors', 'Accounts', 'Status', 'Created', 'Actions']);
    expect(screen.getByText('Ann - ops@alpha.test')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expectNoProhibitedField();
  });

  it('search and status filters go to the API and reset to page 1', async () => {
    routeApi(fetchMock, { 'GET /vendors?': page([vendor()], 60) });
    const user = userEvent.setup();
    renderWithProviders(<VendorsPage />);
    await screen.findByText('Vendor Alpha');
    await user.click(screen.getByRole('button', { name: 'Go to page 2' }));
    await waitFor(() => expect(callsTo(fetchMock, '/vendors?page=2&pageSize=25&status=all')).not.toHaveLength(0));
    await user.type(screen.getByLabelText('Search'), 'alp');
    await waitFor(() => expect(callsTo(fetchMock, '/vendors?page=1&pageSize=25&search=alp&status=all')).not.toHaveLength(0));
    await chooseOption(user, 'Status', 'Inactive');
    await waitFor(() => expect(callsTo(fetchMock, '/vendors?page=1&pageSize=25&search=alp&status=inactive')).not.toHaveLength(0));
  });

  it('validates and creates a vendor (code stored upper-case)', async () => {
    routeApi(fetchMock, { 'GET /vendors?': page([]), 'POST /vendors': (_p: string, o: RequestInit) => vendor(JSON.parse(String(o.body))) });
    const user = userEvent.setup();
    renderWithProviders(<VendorsPage />);
    await screen.findByText('No vendors found');
    await user.click(screen.getByRole('button', { name: 'Create Vendor' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Vendor Name'), 'A');
    await user.type(within(dialog).getByLabelText('Vendor Code'), 'no spaces');
    await user.type(within(dialog).getByLabelText('Contact Email'), 'nope');
    await user.click(within(dialog).getByRole('button', { name: 'Create Vendor' }));
    expect(await within(dialog).findByText('Vendor name must be at least 2 characters')).toBeInTheDocument();
    expect(within(dialog).getByText('Code: 2-20 letters, numbers, "-" or "_"')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a valid email address')).toBeInTheDocument();
    expect(callsTo(fetchMock, '/vendors', 'POST')).toHaveLength(0);

    await user.clear(within(dialog).getByLabelText('Vendor Name'));
    await user.type(within(dialog).getByLabelText('Vendor Name'), 'Vendor Gamma');
    await user.clear(within(dialog).getByLabelText('Vendor Code'));
    await user.type(within(dialog).getByLabelText('Vendor Code'), 'gamma-1');
    await user.clear(within(dialog).getByLabelText('Contact Email'));
    await user.click(within(dialog).getByRole('button', { name: 'Create Vendor' }));
    await waitFor(() => expect(callsTo(fetchMock, '/vendors', 'POST')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/vendors', 'POST')[0][1].body)).toEqual({ name: 'Vendor Gamma', code: 'GAMMA-1', contactName: '', contactEmail: '' });
    expect(await screen.findByText('Vendor Vendor Gamma created.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('edits without the permanent code, deactivates only after confirmation, activates directly, and opens a vendor', async () => {
    routeApi(fetchMock, {
      'GET /vendors?': page([vendor(), vendor({ id: 'v2', name: 'Vendor Beta', code: 'BETA', isActive: false })]),
      'PATCH /vendors/': (p: string) => vendor({ isActive: p.endsWith('activate') && !p.endsWith('deactivate') }),
    });
    const user = userEvent.setup();
    renderWithProviders(<VendorsPage />);
    await screen.findByText('Vendor Beta');

    await user.click(screen.getByRole('button', { name: 'Actions for Vendor Alpha' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Vendor Code')).toBeDisabled();
    await user.clear(within(dialog).getByLabelText('Vendor Name'));
    await user.type(within(dialog).getByLabelText('Vendor Name'), 'Vendor Alpha Two');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(callsTo(fetchMock, `/vendors/${V}`, 'PATCH')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, `/vendors/${V}`, 'PATCH')[0][1].body)).toEqual({ name: 'Vendor Alpha Two', contactName: 'Ann', contactEmail: 'ops@alpha.test' });
    await screen.findByText('Vendor Vendor Alpha Two updated.');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(await screen.findByRole('button', { name: 'Actions for Vendor Alpha' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Deactivate' }));
    const confirm = await screen.findByRole('dialog');
    expect(within(confirm).getByText(/vendor accounts will be signed out/)).toBeInTheDocument();
    expect(callsTo(fetchMock, `/vendors/${V}/deactivate`, 'PATCH')).toHaveLength(0);
    await user.click(within(confirm).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(callsTo(fetchMock, `/vendors/${V}/deactivate`, 'PATCH')).toHaveLength(1));
    await screen.findByText('Vendor Alpha deactivated.');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(await screen.findByRole('button', { name: 'Actions for Vendor Beta' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Activate' }));
    await waitFor(() => expect(callsTo(fetchMock, '/vendors/v2/activate', 'PATCH')).toHaveLength(1));
    await screen.findByText('Vendor Beta activated.');

    await user.click(await screen.findByRole('button', { name: 'Actions for Vendor Beta' }));
    await user.click(await screen.findByRole('menuitem', { name: 'View' }));
    expect(push).toHaveBeenCalledWith('/manager/vendors/v2');
  });
});

describe('Manager - Vendor detail and assignments', () => {
  const routes = (extra: Record<string, unknown> = {}) => ({
    [`GET /vendors/${V}/dashboard`]: dashboard,
    [`GET /vendors/${V}/assignable`]: [{ ...person('tl-2', 'Tom Lead'), team: { id: 't2', name: 'Team Two' } }],
    [`GET /vendors/${V}`]: detail(),
    'GET /rework?': page([]),
    ...extra,
  });

  it('shows the vendor overview metrics for this vendor only', async () => {
    routeApi(fetchMock, routes());
    renderWithProviders(<VendorDetailPage />);
    expect(await screen.findByRole('heading', { name: 'Vendor Alpha' })).toBeInTheDocument();
    expect(await screen.findByText('Pending Rework')).toBeInTheDocument();
    expect(callsTo(fetchMock, `/vendors/${V}/dashboard?today=`)).toHaveLength(1);
    // the rework list is pinned to this vendor
    await waitFor(() => expect(callsTo(fetchMock, `/rework?page=1&pageSize=25&status=pending&vendorId=${V}`)).toHaveLength(1));
  });

  it('assigns a Team Lead from the unassigned candidates and removes one after confirmation', async () => {
    routeApi(fetchMock, routes({
      [`POST /vendors/${V}/team-leads`]: { assignmentId: 'as-2' },
      [`DELETE /vendors/${V}/team-leads/`]: { assignmentId: 'as-1' },
    }));
    const user = userEvent.setup();
    renderWithProviders(<VendorDetailPage />);
    await user.click(await screen.findByRole('tab', { name: 'Team Leads (1)' }));
    expect(await screen.findByText('Team Alpha')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Assign Team Lead' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    expect(await within(dialog).findByText('Select a Team Lead')).toBeInTheDocument();
    await chooseOption(user, 'Team Lead', 'Tom Lead (E-tl-2) - Team Two', dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(callsTo(fetchMock, `/vendors/${V}/team-leads`, 'POST')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, `/vendors/${V}/team-leads`, 'POST')[0][1].body)).toEqual({ userId: 'tl-2' });
    await screen.findByText('Tom Lead assigned to Vendor Alpha.');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Remove Tara Lead' }));
    const confirm = await screen.findByRole('dialog');
    expect(within(confirm).getByText(/kept in history/)).toBeInTheDocument();
    expect(callsTo(fetchMock, `/vendors/${V}/team-leads/tl-1`, 'DELETE')).toHaveLength(0);
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(callsTo(fetchMock, `/vendors/${V}/team-leads/tl-1`, 'DELETE')).toHaveLength(1));
    await screen.findByText('Tara Lead removed from Vendor Alpha.');
  });

  it('shows the backend reason when an assignment would cross vendors', async () => {
    routeApi(fetchMock, routes({
      [`GET /vendors/${V}/assignable`]: [person('aud-9', 'Ben Auditor')],
      [`POST /vendors/${V}/auditors`]: () => {
        throw new Error('Cannot assign this Auditor: they are assigned to project(s) outside this vendor (Ortho).');
      },
    }));
    const user = userEvent.setup();
    renderWithProviders(<VendorDetailPage />);
    await user.click(await screen.findByRole('tab', { name: 'Auditors (0)' }));
    await user.click(await screen.findByRole('button', { name: 'Assign Auditor' }));
    const dialog = await screen.findByRole('dialog');
    await chooseOption(user, 'Auditor', 'Ben Auditor (E-aud-9)', dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    expect(await within(dialog).findByText(/outside this vendor \(Ortho\)/)).toBeInTheDocument();
  });

  // Split into two single-concern tests (matching this file's own pattern
  // of one concern per `it`) rather than one test that visits the Team
  // Structure tab (its own fetch + tab switch + nested-region assertions)
  // on the way to an unrelated 6-field, double-submit account-creation
  // flow. That coupling made this the heaviest test in the file for no
  // reason tied to what either half actually verifies, which is what
  // pushed its real wall-clock time closest to Jest's default per-test
  // budget on a slower machine - not an async/await gap (every
  // interaction here already used the same await user.click/type,
  // findBy* and waitFor patterns as the rest of this file; injecting
  // artificial latency into the mocked structure and create-account
  // responses only scaled the total time linearly, it never produced a
  // hang). Splitting removes the unrelated Team Structure fetch/tab-switch
  // from the account-validation path while keeping every assertion.
  it('shows the team structure', async () => {
    routeApi(fetchMock, routes({
      [`GET /vendors/${V}/structure`]: {
        vendor: { id: V, name: 'Vendor Alpha', code: 'ALPHA', isActive: true },
        teams: [{ id: 't1', name: 'Team Alpha', teamLead: person('tl-1', 'Tara Lead'), coders: [person('c1', 'Cody Coder')], projects: [{ id: 'p1', name: 'Cardio', isActive: true }] }],
        auditors: [{ ...person('a1', 'Ava Auditor'), projects: [{ id: 'p1', name: 'Cardio' }] }],
      },
    }));
    const user = userEvent.setup();
    renderWithProviders(<VendorDetailPage />);
    await user.click(await screen.findByRole('tab', { name: 'Team Structure' }));
    const team = await screen.findByRole('region', { name: 'Team Team Alpha' });
    expect(within(team).getByText('Cody Coder')).toBeInTheDocument();
    expect(within(team).getByText('Cardio')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Auditors' })).getByText('Ava Auditor')).toBeInTheDocument();
  });

  it('validates new vendor accounts', async () => {
    routeApi(fetchMock, routes({
      [`POST /vendors/${V}/accounts`]: { id: 'va-2' },
    }));
    const user = userEvent.setup();
    renderWithProviders(<VendorDetailPage />);
    // These four presses use fireEvent.click, not user.click, deliberately.
    // Every one of them lands on an MUI ButtonBase (a Tab or a Button),
    // and user.click's realistic pointerdown/mousedown-first sequence is
    // exactly what starts ButtonBase's TouchRipple animation - which then
    // finishes on its own real setTimeout well after this test (and
    // act()) has moved on. That's the ButtonBase/TouchRipple act()
    // warning source, and instrumenting this test's steps with
    // timestamps showed each such click costing ~150-200ms here even on
    // a fast machine (measured 208ms and 153ms for the two submit
    // clicks) - the same per-click overhead that can push the total past
    // a fixed timeout on a slower one. fireEvent.click still dispatches
    // a real 'click' DOM event, so the button's onClick/form-submit
    // behavior is unchanged; it only skips the mousedown that ripple
    // needs to start, so there is nothing left running after the click
    // returns. Typing/clearing below is unaffected - Input isn't a
    // ButtonBase and isn't the source of this.
    fireEvent.click(await screen.findByRole('tab', { name: 'Vendor Accounts (1)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create Vendor Account' }));
    const dialog = await screen.findByRole('dialog');
    for (const [label, value] of [['Full Name', 'Beta Ops'], ['Employee ID', 'E-77'], ['Login Name', 'vendor.ops'], ['Email', 'ops@x.local'], ['Password', 'Password1'], ['Confirm Password', 'Password2']]) {
      await user.type(within(dialog).getByLabelText(label), value);
    }
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Account' }));
    expect(await within(dialog).findByText('Passwords do not match')).toBeInTheDocument();
    expect(callsTo(fetchMock, `/vendors/${V}/accounts`, 'POST')).toHaveLength(0);
    await user.clear(within(dialog).getByLabelText('Confirm Password'));
    await user.type(within(dialog).getByLabelText('Confirm Password'), 'Password1');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Account' }));
    await waitFor(() => expect(callsTo(fetchMock, `/vendors/${V}/accounts`, 'POST')).toHaveLength(1));
    await screen.findByText('Vendor account vendor.ops created.');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it("resets a Vendor account's password: confirm, then a one-time display of the temporary password", async () => {
    routeApi(fetchMock, routes({
      'POST /users/va-1/reset-password': { id: 'va-1', loginName: 'va-1.login', temporaryPassword: 'Tmp9!xYzAbc' },
    }));
    const user = userEvent.setup();
    renderWithProviders(<VendorDetailPage />);
    await user.click(await screen.findByRole('tab', { name: 'Vendor Accounts (1)' }));
    await user.click(await screen.findByRole('button', { name: 'Reset Password' }));
    expect(await screen.findByText(/Generate a new one-time password for Alpha Ops/)).toBeInTheDocument();
    expect(callsTo(fetchMock, '/users/va-1/reset-password', 'POST')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Reset Password' }));
    await waitFor(() => expect(callsTo(fetchMock, '/users/va-1/reset-password', 'POST')).toHaveLength(1));
    expect(await screen.findByText('Password reset')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tmp9!xYzAbc')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByText('Password reset')).not.toBeInTheDocument());
  });

  it("changes a Vendor account's Login Name directly", async () => {
    routeApi(fetchMock, routes({
      'PATCH /users/va-1/login-name': { id: 'va-1', loginName: 'va.renamed' },
    }));
    const user = userEvent.setup();
    renderWithProviders(<VendorDetailPage />);
    await user.click(await screen.findByRole('tab', { name: 'Vendor Accounts (1)' }));
    await user.click(await screen.findByRole('button', { name: 'Change Login Name' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Login Name')).toHaveValue('va-1.login');

    await user.clear(within(dialog).getByLabelText('Login Name'));
    await user.type(within(dialog).getByLabelText('Login Name'), 'va.renamed');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(callsTo(fetchMock, '/users/va-1/login-name', 'PATCH')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/users/va-1/login-name', 'PATCH')[0][1].body)).toEqual({ loginName: 'va.renamed' });
    expect(await screen.findByText('Login Name changed to va.renamed.')).toBeInTheDocument();
  });
});

describe('Manager - dashboard vendor view and vendor filters', () => {
  const overview = [
    { id: V, name: 'Vendor Alpha', code: 'ALPHA', isActive: true, teamLeads: 2, auditors: 1, coders: 7, productionCompleted: 1200, auditsCompleted: 300, pendingRework: 3 },
    { id: 'v2', name: 'Vendor Beta', code: 'BETA', isActive: false, teamLeads: 0, auditors: 0, coders: 0, productionCompleted: 0, auditsCompleted: 0, pendingRework: 0 },
  ];

  it('lists all vendors with status and workload, and switches the figures to one vendor', async () => {
    routeApi(fetchMock, {
      'GET /reports/dashboard': { role: 'MANAGER', metrics: [{ key: 'charts', label: 'Charts', value: 5 }] },
      'GET /vendors/overview': overview,
      'GET /vendors/options': overview.map(({ id, name, code, isActive }) => ({ id, name, code, isActive })),
      [`GET /vendors/${V}/dashboard`]: dashboard,
    });
    const user = userEvent.setup();
    renderWithProviders(<ManagerDashboard />);
    const table = await screen.findByRole('region', { name: 'Vendors overview' });
    const alpha = (await within(table).findByText('Vendor Alpha')).closest('tr')!;
    expect(within(alpha).getByText('1,200')).toBeInTheDocument();
    expect(within(alpha).getByText('3')).toBeInTheDocument();
    expect(within((await within(table).findByText('Vendor Beta')).closest('tr')!).getByText('Inactive')).toBeInTheDocument();
    expect(await screen.findByText('Charts')).toBeInTheDocument();

    await chooseOption(user, 'Vendor', 'Vendor Alpha');
    // the vendor metric card appears next to the overview table's "Pending Rework" column
    await waitFor(() => expect(screen.getAllByText('Pending Rework')).toHaveLength(2));
    expect(screen.getByText('Vendor overview')).toBeInTheDocument();
    expect(callsTo(fetchMock, `/vendors/${V}/dashboard?today=`)).toHaveLength(1);
  });

  it('the Manager production list narrows by vendor through the API', async () => {
    routeApi(fetchMock, {
      'GET /production?': page([]),
      'GET /vendors/options': [{ id: V, name: 'Vendor Alpha', code: 'ALPHA', isActive: true }],
    });
    const user = userEvent.setup();
    renderWithProviders(<ManagerProduction />);
    await screen.findByText('No production records found');
    await chooseOption(user, 'Vendor', 'Vendor Alpha');
    await waitFor(() => expect(callsTo(fetchMock, `/production?page=1&pageSize=25&vendorId=${V}`)).toHaveLength(1));
  });
});
