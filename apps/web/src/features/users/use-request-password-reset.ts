'use client';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface RequestPasswordResetResult {
  id: string;
  status: string;
}

/**
 * docs/09-BUSINESS-RULES.md section 8 (Phase 8) - Vendor/Team Lead can no
 * longer reset a Coder's password directly; this only FILES a request. A
 * Manager must approve it (on /manager/password-reset-requests), which
 * generates a single-use reset link, before the password actually
 * changes. Scope (own vendor / own team) is enforced entirely
 * server-side.
 */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiFetch<RequestPasswordResetResult>(`/users/${id}/reset-password-request`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
  });
}
