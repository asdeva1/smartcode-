import * as React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResetPasswordPage from './page';
import { apiFetch } from '@/lib/api-client';
import { callsTo, renderWithProviders, routeApi } from '@/test-utils/render';

let searchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));
jest.mock('@/lib/api-client', () => ({
  ...jest.requireActual('@/lib/api-client'),
  apiFetch: jest.fn(),
}));

const fetchMock = apiFetch as jest.Mock;

describe('Public - Reset Password page', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    searchParams = new URLSearchParams();
  });

  it('shows an error when the link has no token', async () => {
    renderWithProviders(<ResetPasswordPage />);
    expect(await screen.findByText(/missing its token/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates the token on load and shows the form when valid', async () => {
    searchParams = new URLSearchParams('token=good-token');
    routeApi(fetchMock, { 'POST /password-reset/validate': { valid: true } });
    renderWithProviders(<ResetPasswordPage />);
    expect(await screen.findByLabelText('New Password')).toBeInTheDocument();
    expect(JSON.parse(callsTo(fetchMock, '/password-reset/validate', 'POST')[0][1].body)).toEqual({ token: 'good-token' });
  });

  it('shows an expired-link message without ever showing the form', async () => {
    searchParams = new URLSearchParams('token=old-token');
    routeApi(fetchMock, { 'POST /password-reset/validate': { valid: false, reason: 'expired' } });
    renderWithProviders(<ResetPasswordPage />);
    expect(await screen.findByText(/has expired/)).toBeInTheDocument();
    expect(screen.queryByLabelText('New Password')).not.toBeInTheDocument();
  });

  it('shows a validation error for mismatched passwords, without calling the server', async () => {
    searchParams = new URLSearchParams('token=good-token');
    routeApi(fetchMock, { 'POST /password-reset/validate': { valid: true } });
    const user = userEvent.setup();
    renderWithProviders(<ResetPasswordPage />);
    await user.type(await screen.findByLabelText('New Password'), 'Password1!');
    await user.type(screen.getByLabelText('Confirm New Password'), 'Different1!');
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(callsTo(fetchMock, '/password-reset/complete', 'POST')).toHaveLength(0);
  });

  it('completes the reset and shows a success message', async () => {
    searchParams = new URLSearchParams('token=good-token');
    routeApi(fetchMock, {
      'POST /password-reset/validate': { valid: true },
      'POST /password-reset/complete': { loginName: 'cody.c' },
    });
    const user = userEvent.setup();
    renderWithProviders(<ResetPasswordPage />);
    await user.type(await screen.findByLabelText('New Password'), 'Password1!');
    await user.type(screen.getByLabelText('Confirm New Password'), 'Password1!');
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));
    await waitFor(() => expect(callsTo(fetchMock, '/password-reset/complete', 'POST')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/password-reset/complete', 'POST')[0][1].body)).toEqual({
      token: 'good-token',
      newPassword: 'Password1!',
      confirmNewPassword: 'Password1!',
    });
    expect(await screen.findByText(/has been reset/)).toBeInTheDocument();
  });

  it('shows a server error when the token was used between validation and submission', async () => {
    searchParams = new URLSearchParams('token=good-token');
    const { ApiError } = jest.requireActual('@/lib/api-client');
    routeApi(fetchMock, {
      'POST /password-reset/validate': { valid: true },
      'POST /password-reset/complete': () => Promise.reject(new ApiError(409, 'This reset link has already been used')),
    });
    const user = userEvent.setup();
    renderWithProviders(<ResetPasswordPage />);
    await user.type(await screen.findByLabelText('New Password'), 'Password1!');
    await user.type(screen.getByLabelText('Confirm New Password'), 'Password1!');
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));
    expect(await screen.findByText('This reset link has already been used')).toBeInTheDocument();
  });
});
