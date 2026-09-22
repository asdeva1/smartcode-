'use client';
import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}

export function PageHeader({ title, description, actions, breadcrumb }: PageHeaderProps) {
  return (
    <Box sx={{ mb: 3 }}>
      {breadcrumb}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mt: breadcrumb ? 1 : 0 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {description}
            </Typography>
          )}
        </Box>
        {actions && <Box>{actions}</Box>}
      </Stack>
    </Box>
  );
}
