'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface ValidateResetTokenResult {
  valid: boolean;
  reason?: 'invalid' | 'expired' | 'used' | 'revoked';
}

/**
 * Public reset-password page (docs/09-BUSINESS-RULES.md section 8, Phase
 * 8): validates the token from the link on load, before the user types
 * anything, so an expired/used/invalid/revoked link fails fast with a
 * clear message rather than after they've filled out the form. Never
 * reveals which user the token belongs to - just whether it currently
 * works.
 */
export function useValidateResetToken(token: string | undefined) {
  return useQuery({
    queryKey: ['password-reset', 'validate', token],
    queryFn: () => apiFetch<ValidateResetTokenResult>('/password-reset/validate', { method: 'POST', body: JSON.stringify({ token }) }),
    enabled: !!token,
    retry: false,
  });
}

export function useCompletePasswordReset() {
  return useMutation({
    mutationFn: (input: { token: string; newPassword: string; confirmNewPassword: string }) =>
      apiFetch<{ loginName: string }>('/password-reset/complete', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}
