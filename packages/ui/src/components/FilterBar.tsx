'use client';
import * as React from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';

export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center">
        {children}
      </Stack>
    </Paper>
  );
}
