'use client';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface ResetPasswordResult {
  id: string;
  loginName: string;
  temporaryPassword: string;
}

/**
 * docs/09-BUSINESS-RULES.md section 6/7 (Password Reset). One shared
 * endpoint behind every screen that resets a user's password - Manager:
 * Team Lead / Coder / Auditor / Vendor, Team Lead: own-team Coder only.
 * Scope is enforced entirely server-side; the frontend just calls it.
 * The temporary password is returned exactly once in this response and
 * is never stored, logged, or retrievable again afterward.
 */
export function useResetPassword() {
  return useMutation({
    mutationFn: (id: string) => apiFetch<ResetPasswordResult>(`/users/${id}/reset-password`, { method: 'POST' }),
  });
}
