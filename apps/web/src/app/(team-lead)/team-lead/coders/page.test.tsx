import * as React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CodersPage from './page';
import TeamPage from '../team/page';
import { apiDownload, apiFetch, apiUpload } from '@/lib/api-client';
import { callsTo, chooseOption, expectNoProhibitedField, page, renderWithProviders, routeApi } from '@/test-utils/render';

jest.mock('@/lib/api-client', () => ({
  ...jest.requireActual('@/lib/api-client'),
  apiFetch: jest.fn(),
  apiUpload: jest.fn(),
  apiDownload: jest.fn(),
}));

const fetchMock = apiFetch as jest.Mock;
const uploadMock = apiUpload as jest.Mock;
const downloadMock = apiDownload as jest.Mock;

const coder = {
  id: 'c-1', employeeId: 'EMP100', loginName: 'cody', email: 'cody@x.local', fullName: 'Cody Coder',
  role: 'CODER', isActive: true, createdAt: '2026-01-02T00:00:00.000Z', lastLoginAt: null,
};
const inactive = { ...coder, id: 'c-2', loginName: 'ina', fullName: 'Ina Active', employeeId: 'EMP101', isActive: false };

const listCalls = () => callsTo(fetchMock, '/team-leads/coders?').map(([p]) => p as string);

describe('Team Lead - Coders page', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    uploadMock.mockReset();
    downloadMock.mockReset();
  });

  it('renders the roster with status and created date', async () => {
    routeApi(fetchMock, { 'GET /team-leads/coders?': page([coder, inactive]) });
    renderWithProviders(<CodersPage />);
    expect(await screen.findByText('Cody Coder')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Coders' })).toBeInTheDocument();
    expect(screen.getByText('EMP100')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Employee ID', 'Full Name', 'Login Name', 'Email', 'Team Lead', 'Status', 'Created Date', 'Actions',
    ]);
    expectNoProhibitedField();
  });

  it('shows loading, empty and error (with retry) states', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { unmount } = renderWithProviders(<CodersPage />);
    expect(await screen.findByText('Loading...')).toBeInTheDocument();
    unmount();

    routeApi(fetchMock, { 'GET /team-leads/coders?': page([]) });
    const r2 = renderWithProviders(<CodersPage />);
    expect(await screen.findByText('No Coders found')).toBeInTheDocument();
    r2.unmount();

    fetchMock.mockRejectedValue(new Error('down'));
    const user = userEvent.setup();
    renderWithProviders(<CodersPage />);
    expect(await screen.findByText('Could not load Coders. Please try again.')).toBeInTheDocument();
    routeApi(fetchMock, { 'GET /team-leads/coders?': page([coder]) });
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Cody Coder')).toBeInTheDocument();
  });

  it('search and status filter go to the API and reset to page 1; pagination moves pages', async () => {
    routeApi(fetchMock, { 'GET /team-leads/coders?': page([coder], 60) });
    const user = userEvent.setup();
    renderWithProviders(<CodersPage />);
    await screen.findByText('Cody Coder');
    await user.click(screen.getByRole('button', { name: 'Go to page 3' }));
    await waitFor(() => expect(listCalls()).toContain('/team-leads/coders?page=3&pageSize=25&status=all'));
    await user.type(screen.getByLabelText('Search'), 'cod');
    await waitFor(() => expect(listCalls()).toContain('/team-leads/coders?page=1&pageSize=25&search=cod&status=all'));
    await chooseOption(user, 'Status', 'Inactive');
    await waitFor(() => expect(listCalls()).toContain('/team-leads/coders?page=1&pageSize=25&search=cod&status=inactive'));
  });

  it('validates the Create Coder form (required fields, password rule, confirmation) before calling the API', async () => {
    routeApi(fetchMock, { 'GET /team-leads/coders?': page([]) });
    const user = userEvent.setup();
    renderWithProviders(<CodersPage />);
    await user.click(await screen.findByRole('button', { name: 'Create Coder' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^password/i), 'short');
    await user.type(within(dialog).getByLabelText(/confirm password/i), 'other');
    await user.click(within(dialog).getByRole('button', { name: 'Create Coder' }));
    expect(await within(dialog).findByText('Employee ID is required')).toBeInTheDocument();
    expect(within(dialog).getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(callsTo(fetchMock, '/team-leads/coders', 'POST')).toHaveLength(0);
  });

  it('creates a Coder: no team field is sent (the backend uses the Team Lead\'s team)', async () => {
    routeApi(fetchMock, { 'GET /team-leads/coders?': page([]), 'POST /team-leads/coders': { ...coder, id: 'new' } });
    const user = userEvent.setup();
    renderWithProviders(<CodersPage />);
    await user.click(await screen.findByRole('button', { name: 'Create Coder' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/employee id/i), 'EMP200');
    await user.type(within(dialog).getByLabelText(/full name/i), 'New Coder');
    await user.type(within(dialog).getByLabelText(/login name/i), 'new.coder');
    await user.type(within(dialog).getByLabelText(/email/i), 'new@x.local');
    await user.type(within(dialog).getByLabelText(/^password/i), 'Password1!');
    await user.type(within(dialog).getByLabelText(/confirm password/i), 'Password1!');
    await user.click(within(dialog).getByRole('button', { name: 'Create Coder' }));
    await waitFor(() => expect(callsTo(fetchMock, '/team-leads/coders', 'POST')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/team-leads/coders', 'POST')[0][1].body)).toEqual({
      employeeId: 'EMP200', fullName: 'New Coder', loginName: 'new.coder', email: 'new@x.local',
      password: 'Password1!', confirmPassword: 'Password1!', isActive: true,
    });
    expect(await screen.findByText('Coder account created.')).toBeInTheDocument();
  });

  it('edits a Coder: login name read-only, only editable fields sent', async () => {
    routeApi(fetchMock, { 'GET /team-leads/coders?': page([coder]), 'PATCH /team-leads/coders/c-1': coder });
    const user = userEvent.setup();
    renderWithProviders(<CodersPage />);
    await user.click(await screen.findByRole('button', { name: 'Actions for Cody Coder' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/login name/i)).toBeDisabled();
    await user.clear(within(dialog).getByLabelText(/full name/i));
    await user.type(within(dialog).getByLabelText(/full name/i), 'Cody R');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(callsTo(fetchMock, '/team-leads/coders/c-1', 'PATCH')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/team-leads/coders/c-1', 'PATCH')[0][1].body)).toEqual({
      employeeId: 'EMP100', fullName: 'Cody R', email: 'cody@x.local',
    });
  });

  it('resets a Coder\'s password: confirm, then a one-time display of the temporary password', async () => {
    routeApi(fetchMock, {
      'GET /team-leads/coders?': page([coder]),
      'POST /users/c-1/reset-password': { id: 'c-1', loginName: 'cody', temporaryPassword: 'Tmp9!xYzAbc' },
    });
    const user = userEvent.setup();
    renderWithProviders(<CodersPage />);
    await user.click(await screen.findByRole('button', { name: 'Actions for Cody Coder' }));
    await user.click(screen.getByRole('menuitem', { name: 'Reset Password' }));
    expect(await screen.findByText(/Generate a new one-time password for Cody Coder/)).toBeInTheDocument();
    expect(callsTo(fetchMock, '/users/c-1/reset-password', 'POST')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Reset Password' }));
    await waitFor(() => expect(callsTo(fetchMock, '/users/c-1/reset-password', 'POST')).toHaveLength(1));
    expect(await screen.findByText('Password reset')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tmp9!xYzAbc')).toBeInTheDocument();
    expect(screen.getByText(/shown only once/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByText('Password reset')).not.toBeInTheDocument());
  });

  it('requests a Coder Login Name change - filed as pending, never applied directly', async () => {
    routeApi(fetchMock, {
      'GET /team-leads/coders?': page([coder]),
      'POST /team-leads/coders/c-1/login-name-request': {
        id: 'req-1', type: 'LOGIN_NAME_CHANGE', status: 'PENDING',
        targetUser: { id: 'c-1', fullName: 'Cody Coder', employeeId: 'EMP100', loginName: 'cody' },
        requestedBy: { id: 'tl-1', fullName: 'Tara Lead', employeeId: 'EMP002', loginName: 'tl.one' },
        requestedAt: '2026-09-27T00:00:00.000Z',
        payload: { currentLoginName: 'cody', requestedLoginName: 'cody.new' },
        reviewedBy: null, reviewedAt: null, rejectionReason: null,
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<CodersPage />);
    await user.click(await screen.findByRole('button', { name: 'Actions for Cody Coder' }));
    await user.click(screen.getByRole('menuitem', { name: 'Request Login Name Change' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Current Login Name')).toHaveValue('cody');

    await user.type(within(dialog).getByLabelText('Requested Login Name'), 'cody.new');
    await user.click(within(dialog).getByRole('button', { name: 'Submit for Approval' }));
    await waitFor(() => expect(callsTo(fetchMock, '/team-leads/coders/c-1/login-name-request', 'POST')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/team-leads/coders/c-1/login-name-request', 'POST')[0][1].body)).toEqual({ loginName: 'cody.new' });
    expect(await screen.findByText(/awaiting Manager approval/)).toBeInTheDocument();
    // The list is never patched directly by this flow - only a request was filed.
    expect(callsTo(fetchMock, '/team-leads/coders/c-1', 'PATCH')).toHaveLength(0);
  });

  it('deactivates only after confirmation, and activates directly', async () => {
    routeApi(fetchMock, {
      'GET /team-leads/coders?': page([coder, inactive]),
      'PATCH /users/c-1/deactivate': { ...coder, isActive: false },
      'PATCH /users/c-2/activate': { ...inactive, isActive: true },
    });
    const user = userEvent.setup();
    renderWithProviders(<CodersPage />);
    await user.click(await screen.findByRole('button', { name: 'Actions for Cody Coder' }));
    await user.click(screen.getByRole('menuitem', { name: 'Deactivate' }));
    expect(await screen.findByText(/will no longer be able to log in/)).toBeInTheDocument();
    expect(callsTo(fetchMock, '/users/c-1/deactivate', 'PATCH')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(callsTo(fetchMock, '/users/c-1/deactivate', 'PATCH')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Actions for Ina Active' }));
    await user.click(screen.getByRole('menuitem', { name: 'Activate' }));
    await waitFor(() => expect(callsTo(fetchMock, '/users/c-2/activate', 'PATCH')).toHaveLength(1));
  });

  it('views a Coder with production stats and Vendor', async () => {
    routeApi(fetchMock, {
      'GET /team-leads/coders?': page([coder]),
      'GET /team-leads/coders/c-1': {
        ...coder,
        vendor: { id: 'v-1', name: 'Vendor Alpha' },
        stats: { charts: 7, completed: 5, inProgress: 1, rework: 1, pages: 90, dos: 12, icds: 44 },
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<CodersPage />);
    await user.click(await screen.findByRole('button', { name: 'Actions for Cody Coder' }));
    await user.click(screen.getByRole('menuitem', { name: 'View' }));
    expect(await screen.findByText('Coder details')).toBeInTheDocument();
    expect(await screen.findByText('90')).toBeInTheDocument();
    expect(screen.getByText('44')).toBeInTheDocument();
    expect(screen.getByText('Vendor Alpha')).toBeInTheDocument();
  });

  it('exports PDF, Excel and CSV through the backend with the current filters', async () => {
    routeApi(fetchMock, { 'GET /team-leads/coders?': page([coder]) });
    downloadMock.mockResolvedValue('smartcode-team-coders.pdf');
    const user = userEvent.setup();
    renderWithProviders(<CodersPage />);
    await screen.findByText('Cody Coder');
    await user.type(screen.getByLabelText('Search'), 'cod');
    for (const [label, format] of [['Export PDF', 'pdf'], ['Export Excel', 'xlsx'], ['Export CSV', 'csv']]) {
      await user.click(screen.getByRole('button', { name: 'Export' }));
      await user.click(screen.getByRole('menuitem', { name: label }));
      await waitFor(() => expect(downloadMock).toHaveBeenLastCalledWith(`/team-leads/coders/export?search=cod&status=all&format=${format}`));
    }
  });

  describe('CSV import', () => {
    const openImport = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(await screen.findByRole('button', { name: 'Import CSV' }));
      return screen.findByRole('dialog');
    };
    const preview = {
      fileName: 'coders.csv', totalRows: 3, validRows: 1, invalidRows: 1, duplicateRows: 1,
      rows: [
        { rowNumber: 2, status: 'valid', errors: [], data: { employeeId: 'EMP1', fullName: 'A', loginName: 'a', email: 'a@x.local', status: 'Active', password: '••••••' } },
        { rowNumber: 3, status: 'invalid', errors: ['email: email must be an email'], data: { employeeId: 'EMP2', fullName: 'B', loginName: 'b', email: 'bad', status: '' } },
        { rowNumber: 4, status: 'duplicate', errors: ['employeeId "EMP1" is repeated (first seen on row 2)'], data: { employeeId: 'EMP1', fullName: 'C', loginName: 'c', email: 'c@x.local', status: '' } },
      ],
    };

    it('refuses non-CSV files (Excel/PDF) before calling the API', async () => {
      routeApi(fetchMock, { 'GET /team-leads/coders?': page([]) });
      const user = userEvent.setup({ applyAccept: false });
      renderWithProviders(<CodersPage />);
      const dialog = await openImport(user);
      await user.upload(within(dialog).getByLabelText('CSV file'), new File(['x'], 'coders.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      expect(await within(dialog).findByText(/Only \.csv files can be imported/)).toBeInTheDocument();
      expect(uploadMock).not.toHaveBeenCalled();
    });

    it('previews rows with per-row errors, imports only after confirmation, and shows the summary', async () => {
      routeApi(fetchMock, { 'GET /team-leads/coders?': page([]) });
      uploadMock.mockImplementation(async (path: string) =>
        path.endsWith('/preview') ? preview : { fileName: 'coders.csv', imported: 1, skipped: 2, rows: preview.rows },
      );
      const user = userEvent.setup();
      renderWithProviders(<CodersPage />);
      const dialog = await openImport(user);
      await user.upload(within(dialog).getByLabelText('CSV file'), new File(['employeeId\n'], 'coders.csv', { type: 'text/csv' }));

      expect(await within(dialog).findByText('1 valid')).toBeInTheDocument();
      expect(within(dialog).getByText('1 invalid')).toBeInTheDocument();
      expect(within(dialog).getByText('1 duplicate')).toBeInTheDocument();
      expect(within(dialog).getByText('email: email must be an email')).toBeInTheDocument();
      expect(within(dialog).getByText(/is repeated/)).toBeInTheDocument();
      expect(uploadMock).toHaveBeenCalledTimes(1);
      expect(uploadMock.mock.calls[0][0]).toBe('/team-leads/coders/import/preview');

      await user.click(within(dialog).getByRole('button', { name: 'Import 1 valid row(s)' }));
      expect(await within(dialog).findByText('Import complete: 1 imported, 2 skipped.')).toBeInTheDocument();
      expect(uploadMock.mock.calls[1][0]).toBe('/team-leads/coders/import');
    });

    it('does not allow importing when there are no valid rows, and shows backend rejections', async () => {
      routeApi(fetchMock, { 'GET /team-leads/coders?': page([]) });
      uploadMock.mockResolvedValueOnce({ ...preview, validRows: 0, rows: preview.rows.slice(1) });
      const user = userEvent.setup();
      renderWithProviders(<CodersPage />);
      const dialog = await openImport(user);
      await user.upload(within(dialog).getByLabelText('CSV file'), new File(['x'], 'coders.csv', { type: 'text/csv' }));
      expect(await within(dialog).findByRole('button', { name: 'Import 0 valid row(s)' })).toBeDisabled();

      await user.click(within(dialog).getByRole('button', { name: 'Choose another file' }));
      uploadMock.mockRejectedValueOnce(new Error('Missing required column(s): email'));
      await user.upload(within(dialog).getByLabelText('CSV file'), new File(['x'], 'coders.csv', { type: 'text/csv' }));
      expect(await within(dialog).findByText('Missing required column(s): email')).toBeInTheDocument();
    });
  });

  it('My Team page reuses the same roster', async () => {
    routeApi(fetchMock, { 'GET /team-leads/coders?': page([coder]) });
    renderWithProviders(<TeamPage />);
    expect(await screen.findByRole('heading', { name: 'My Team' })).toBeInTheDocument();
    expect(await screen.findByText('Cody Coder')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import CSV' })).toBeInTheDocument();
  });
});
