'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@smartcode/types';
import { ROLE_HOME } from '@smartcode/config';
import { LoadingState } from '@smartcode/ui';
import { useCurrentUser } from './use-auth';

/**
 * Frontend route protection - see docs/05-FRONTEND-ARCHITECTURE.md.
 * This is UX convenience only: a Coder redirected away from
 * /manager/* never even requests manager data client-side, but the
 * backend independently rejects the same request regardless of
 * whether this guard exists or is bypassed. See docs/03-RBAC-PERMISSIONS.md
 * "Enforcement Model".
 *
 * Phase 1 note: this is a client-component guard rather than the
 * server-component cookie check originally sketched in
 * docs/05-FRONTEND-ARCHITECTURE.md. Flagged as a known refinement for
 * a later phase (moves the redirect earlier, before any client bundle
 * for the protected section loads) - functionally equivalent for now
 * since the backend is the real boundary either way.
 */
export function RoleGuard({ role, children }: { role: Role; children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading, isError } = useCurrentUser();

  React.useEffect(() => {
    if (isLoading) return;
    if (!user || isError) {
      router.replace('/login');
      return;
    }
    if (user.role !== role) {
      router.replace(ROLE_HOME[user.role]);
    }
  }, [user, isLoading, isError, role, router]);

  if (isLoading || !user || user.role !== role) {
    return <LoadingState label="Checking access..." />;
  }

  return <>{children}</>;
}
