'use client';
import * as React from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { AppShell } from './AppShell';
import { LoadingState } from '@smartcode/ui';

/**
 * By the time this renders, RoleGuard (the parent layout) has already
 * confirmed a matching, authenticated user exists in the store - this
 * component only exists to satisfy AppShell's non-null `user` prop
 * without every layout.tsx repeating the same store read.
 */
export function AppShellWithUser({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <LoadingState />;
  return <AppShell user={user}>{children}</AppShell>;
}
