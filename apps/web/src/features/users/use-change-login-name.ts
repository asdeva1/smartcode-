'use client';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface ChangeLoginNameResult {
  id: string;
  loginName: string;
}

/**
 * docs/09-BUSINESS-RULES.md section 8 (Login Name Change) - Manager-only,
 * direct change (Team Lead/Auditor/Vendor/Coder where authorized). A Team
 * Lead's own Coder Login Name change instead goes through the request/
 * approval flow (section 9) - see use-request-login-name-change.ts.
 */
export function useChangeLoginName() {
  return useMutation({
    mutationFn: ({ id, loginName }: { id: string; loginName: string }) =>
      apiFetch<ChangeLoginNameResult>(`/users/${id}/login-name`, {
        method: 'PATCH',
        body: JSON.stringify({ loginName }),
      }),
  });
}
