'use client';
import * as React from 'react';
import Link from 'next/link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Button } from '@smartcode/ui';
import { useCurrentUser } from '@/features/auth/use-auth';

/** Welcome line with the signed-in user's identity and a row of quick links. */
export function WelcomeAndQuickActions({ actions }: { actions: { label: string; href: string }[] }) {
  const { user } = useCurrentUser();
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={1}>
        <Typography variant="body1">
          Welcome, <strong>{user?.fullName ?? user?.loginName}</strong>
          {user ? ` (${user.employeeId})` : ''}
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {actions.map((a) => (
            <Button key={a.href} size="small" variant="outlined" component={Link} href={a.href}>
              {a.label}
            </Button>
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
}
