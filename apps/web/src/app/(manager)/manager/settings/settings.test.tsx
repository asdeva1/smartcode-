import * as React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from './page';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { callsTo, renderWithProviders, routeApi } from '@/test-utils/render';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/manager/settings',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/api-client', () => ({ ...jest.requireActual('@/lib/api-client'), apiFetch: jest.fn() }));
jest.mock('@/features/auth/use-auth', () => ({
  useCurrentUser: () => ({
    user: { id: 'm', employeeId: 'EMP0001', loginName: 'manager.admin', fullName: 'Mona Manager', role: 'MANAGER', teamId: null, isActive: true, email: 'm@x.local' },
    isLoading: false,
    isError: false,
  }),
}));

const fetchMock = apiFetch as jest.Mock;

async function fill(user: ReturnType<typeof userEvent.setup>, current: string, next: string, confirm: string) {
  const form = screen.getByRole('form', { name: 'Reset password' });
  if (current) await user.type(within(form).getByLabelText('Current Password'), current);
  if (next) await user.type(within(form).getByLabelText('New Password'), next);
  if (confirm) await user.type(within(form).getByLabelText('Confirm New Password'), confirm);
  await user.click(within(form).getByRole('button', { name: 'Change Password' }));
  return form;
}

beforeEach(() => {
  fetchMock.mockReset();
  useAuthStore.setState({ accessToken: 'old-token', user: null });
});

describe('Manager - Settings / Reset Password', () => {
  it('shows the Manager\'s profile and the reset form', () => {
    renderWithProviders(<SettingsPage />);
    expect(screen.getByText('Mona Manager')).toBeInTheDocument();
    expect(screen.getByText('manager.admin')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Reset password' })).toBeInTheDocument();
  });

  it('validates required fields, length, confirmation and reuse before calling the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    const form = await fill(user, '', 'short', 'other');
    expect(await within(form).findByText('Current password is required')).toBeInTheDocument();
    expect(within(form).getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(within(form).getByText('Passwords do not match')).toBeInTheDocument();

    await user.type(within(form).getByLabelText('Current Password'), 'SamePassword1');
    await user.clear(within(form).getByLabelText('New Password'));
    await user.type(within(form).getByLabelText('New Password'), 'SamePassword1');
    await user.clear(within(form).getByLabelText('Confirm New Password'));
    await user.type(within(form).getByLabelText('Confirm New Password'), 'SamePassword1');
    await user.click(within(form).getByRole('button', { name: 'Change Password' }));
    expect(await within(form).findByText('The new password must be different from the current password')).toBeInTheDocument();
    expect(callsTo(fetchMock, '/auth/change-password', 'POST')).toHaveLength(0);
  });

  it('changes the password, keeps this session with the new token, and confirms', async () => {
    routeApi(fetchMock, { 'POST /auth/change-password': { accessToken: 'new-token', message: 'ok' } });
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    const form = await fill(user, 'OldPassword1', 'NewPassword1', 'NewPassword1');
    await waitFor(() => expect(callsTo(fetchMock, '/auth/change-password', 'POST')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/auth/change-password', 'POST')[0][1].body)).toEqual({
      currentPassword: 'OldPassword1',
      newPassword: 'NewPassword1',
      confirmNewPassword: 'NewPassword1',
    });
    expect(await screen.findByText('Password changed. Your other sessions have been signed out.')).toBeInTheDocument();
    expect(screen.getByText('Your password was changed.')).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBe('new-token');
    expect(within(form).getByLabelText('Current Password')).toHaveValue('');
  });

  it('shows the server failure (e.g. wrong current password) and keeps the session', async () => {
    routeApi(fetchMock, {
      'POST /auth/change-password': () => {
        throw new ApiError(400, 'Current password is incorrect');
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    const form = await fill(user, 'WrongPassword1', 'NewPassword1', 'NewPassword1');
    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
    expect(within(form).getByLabelText('Current Password')).toHaveValue('WrongPassword1');
    expect(useAuthStore.getState().accessToken).toBe('old-token');
  });
});
