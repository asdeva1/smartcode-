'use client';
import * as React from 'react';
import Box from '@mui/material/Box';
import type { AuthUser } from '@smartcode/types';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';

export function AppShell({ user, children }: { user: AuthUser; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar role={user.role} />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopNav user={user} />
        <Box component="main" sx={{ p: 3, flex: 1 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
