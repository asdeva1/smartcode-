'use client';
import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';

export interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" fontWeight={700}>
        {title}
      </Typography>
      {description && (
        <Typography variant="caption" color="text.secondary">
          {description}
        </Typography>
      )}
      <Divider sx={{ my: 1.5 }} />
      <Stack spacing={2}>{children}</Stack>
    </Box>
  );
}
