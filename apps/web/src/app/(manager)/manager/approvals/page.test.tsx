import * as React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApprovalsPage from './page';
import { apiFetch } from '@/lib/api-client';
import { callsTo, chooseOption, page, renderWithProviders, routeApi } from '@/test-utils/render';

jest.mock('@/lib/api-client', () => ({
  ...jest.requireActual('@/lib/api-client'),
  apiFetch: jest.fn(),
}));

const fetchMock = apiFetch as jest.Mock;

const pending = {
  id: 'req-1',
  type: 'LOGIN_NAME_CHANGE',
  status: 'PENDING',
  targetUser: { id: 'c-1', fullName: 'Cody Coder', employeeId: 'EMP100', loginName: 'cody' },
  requestedBy: { id: 'tl-1', fullName: 'Tara Lead', employeeId: 'EMP002', loginName: 'tl.one' },
  requestedAt: '2026-09-27T00:00:00.000Z',
  payload: { currentLoginName: 'cody', requestedLoginName: 'cody.new' },
  reviewedBy: null,
  reviewedAt: null,
  rejectionReason: null,
};

describe('Manager - Approvals page', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('lists pending requests by default, showing the requested change', async () => {
    routeApi(fetchMock, { 'GET /manager/approvals?': page([pending]) });
    renderWithProviders(<ApprovalsPage />);
    expect(await screen.findByText('Cody Coder')).toBeInTheDocument();
    expect(screen.getByText('Login Name Change')).toBeInTheDocument();
    expect(screen.getByText('cody → cody.new')).toBeInTheDocument();
    expect(screen.getByText('Tara Lead')).toBeInTheDocument();
    expect(callsTo(fetchMock, '/manager/approvals?', 'GET')[0][0]).toContain('status=PENDING');
  });

  it('approves a request after confirmation, which applies the change', async () => {
    routeApi(fetchMock, {
      'GET /manager/approvals?': page([pending]),
      'PATCH /manager/approvals/req-1/approve': { ...pending, status: 'APPROVED', reviewedBy: { id: 'mgr-1', fullName: 'Manager One', employeeId: 'EMP001', loginName: 'manager.one' }, reviewedAt: '2026-09-27T01:00:00.000Z' },
    });
    const user = userEvent.setup();
    renderWithProviders(<ApprovalsPage />);
    await screen.findByText('Cody Coder');
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    const confirm = await screen.findByRole('dialog');
    expect(within(confirm).getByText(/applies the change immediately/)).toBeInTheDocument();
    expect(callsTo(fetchMock, '/manager/approvals/req-1/approve', 'PATCH')).toHaveLength(0);

    await user.click(within(confirm).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(callsTo(fetchMock, '/manager/approvals/req-1/approve', 'PATCH')).toHaveLength(1));
    expect(await screen.findByText(/Approved: Cody Coder/)).toBeInTheDocument();
  });

  it('rejects a request with a required reason', async () => {
    routeApi(fetchMock, {
      'GET /manager/approvals?': page([pending]),
      'PATCH /manager/approvals/req-1/reject': { ...pending, status: 'REJECTED', rejectionReason: 'Not a valid format' },
    });
    const user = userEvent.setup();
    renderWithProviders(<ApprovalsPage />);
    await screen.findByText('Cody Coder');
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Reject' })).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Rejection reason'), 'Not a valid format');
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(callsTo(fetchMock, '/manager/approvals/req-1/reject', 'PATCH')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/manager/approvals/req-1/reject', 'PATCH')[0][1].body)).toEqual({ reason: 'Not a valid format' });
    expect(await screen.findByText('Request rejected.')).toBeInTheDocument();
  });

  it('filters by status', async () => {
    routeApi(fetchMock, { 'GET /manager/approvals?': page([]) });
    const user = userEvent.setup();
    renderWithProviders(<ApprovalsPage />);
    await screen.findByText('No requests found');
    await chooseOption(user, 'Status', 'All statuses');
    await waitFor(() => expect(callsTo(fetchMock, '/manager/approvals?', 'GET').some(([p]) => (p as string).includes('status=all'))).toBe(true));
  });
});
