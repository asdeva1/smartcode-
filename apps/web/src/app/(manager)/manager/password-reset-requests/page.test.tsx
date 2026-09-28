import * as React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PasswordResetRequestsPage from './page';
import { apiFetch } from '@/lib/api-client';
import { callsTo, chooseOption, page, renderWithProviders, routeApi } from '@/test-utils/render';

jest.mock('@/lib/api-client', () => ({
  ...jest.requireActual('@/lib/api-client'),
  apiFetch: jest.fn(),
}));

const fetchMock = apiFetch as jest.Mock;

const pending = {
  id: 'req-1',
  status: 'PENDING',
  reason: 'Locked out',
  targetUser: {
    id: 'c-1',
    fullName: 'Cody Coder',
    employeeId: 'EMP100',
    loginName: 'cody',
    email: 'cody@x.local',
    role: 'CODER',
    vendor: null,
    team: { id: 't-1', name: 'Team One' },
  },
  requestedBy: { id: 'tl-1', fullName: 'Tara Lead', employeeId: 'EMP002', loginName: 'tl.one' },
  requestedAt: '2026-09-27T00:00:00.000Z',
  reviewedBy: null,
  reviewedAt: null,
  rejectionReason: null,
  resetLink: { status: null, expiresAt: null },
};

describe('Manager - Password Reset Requests page', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('lists pending requests by default, with the target\'s identifying details', async () => {
    routeApi(fetchMock, { 'GET /manager/password-reset-requests?': page([pending]) });
    renderWithProviders(<PasswordResetRequestsPage />);
    expect(await screen.findByText('Cody Coder')).toBeInTheDocument();
    expect(screen.getByText('cody')).toBeInTheDocument();
    expect(screen.getByText('EMP100')).toBeInTheDocument();
    expect(screen.getByText('Team One')).toBeInTheDocument();
    expect(screen.getByText('Tara Lead')).toBeInTheDocument();
    expect(callsTo(fetchMock, '/manager/password-reset-requests?', 'GET')[0][0]).toContain('status=PENDING');
  });

  it('approves a request, showing the one-time reset link exactly once', async () => {
    routeApi(fetchMock, {
      'GET /manager/password-reset-requests?': page([pending]),
      'PATCH /manager/password-reset-requests/req-1/approve': {
        request: { ...pending, status: 'APPROVED' },
        resetUrl: 'https://app.smartcode.local/reset-password?token=abc123',
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<PasswordResetRequestsPage />);
    await screen.findByText('Cody Coder');
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    const confirm = await screen.findByRole('dialog');
    expect(within(confirm).getByText(/single-use reset link/)).toBeInTheDocument();
    expect(callsTo(fetchMock, '/manager/password-reset-requests/req-1/approve', 'PATCH')).toHaveLength(0);

    await user.click(within(confirm).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(callsTo(fetchMock, '/manager/password-reset-requests/req-1/approve', 'PATCH')).toHaveLength(1));
    expect(await screen.findByDisplayValue('https://app.smartcode.local/reset-password?token=abc123')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByDisplayValue('https://app.smartcode.local/reset-password?token=abc123')).not.toBeInTheDocument();
  });

  it('rejects a request with a required reason - no link is ever generated', async () => {
    routeApi(fetchMock, {
      'GET /manager/password-reset-requests?': page([pending]),
      'PATCH /manager/password-reset-requests/req-1/reject': { ...pending, status: 'REJECTED', rejectionReason: 'Not authorized' },
    });
    const user = userEvent.setup();
    renderWithProviders(<PasswordResetRequestsPage />);
    await screen.findByText('Cody Coder');
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Reject' })).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Rejection reason'), 'Not authorized');
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(callsTo(fetchMock, '/manager/password-reset-requests/req-1/reject', 'PATCH')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/manager/password-reset-requests/req-1/reject', 'PATCH')[0][1].body)).toEqual({ reason: 'Not authorized' });
    expect(await screen.findByText('Password reset request rejected.')).toBeInTheDocument();
    expect(callsTo(fetchMock, '/manager/password-reset-requests/req-1/approve', 'PATCH')).toHaveLength(0);
  });

  it('filters by status', async () => {
    routeApi(fetchMock, { 'GET /manager/password-reset-requests?': page([]) });
    const user = userEvent.setup();
    renderWithProviders(<PasswordResetRequestsPage />);
    await screen.findByText('No requests found');
    await chooseOption(user, 'Status', 'All statuses');
    await waitFor(() =>
      expect(callsTo(fetchMock, '/manager/password-reset-requests?', 'GET').some(([p]) => (p as string).includes('status=all'))).toBe(true),
    );
  });
});
