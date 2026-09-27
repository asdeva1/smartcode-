'use client';
import { useMutation } from '@tanstack/react-query';
import type { ApprovalRequest } from '@smartcode/types';
import { apiFetch } from '@/lib/api-client';

/**
 * docs/09-BUSINESS-RULES.md section 9 - a Team Lead can only REQUEST a
 * Login Name change for an own-team Coder; a Manager must Approve or
 * Reject it before the Login Name actually changes (Universal Approval
 * Engine). Team-Lead-only - the Vendor Portal's Coders screen never
 * shows this action, so there is no basePath to parametrize here.
 */
export function useRequestLoginNameChange() {
  return useMutation({
    mutationFn: ({ id, loginName }: { id: string; loginName: string }) =>
      apiFetch<ApprovalRequest>(`/team-leads/coders/${id}/login-name-request`, {
        method: 'POST',
        body: JSON.stringify({ loginName }),
      }),
  });
}
