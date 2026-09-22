'use client';
import * as React from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

export interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  accentColor?: string;
}

/**
 * Deliberately plain: a bordered card, a label, a number. No sparkline,
 * no gradient, no decorative icon-in-a-circle - see brief Section 12
 * "avoid ... huge decorative sections".
 */
export function MetricCard({ label, value, accentColor }: MetricCardProps) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, borderTop: accentColor ? `3px solid ${accentColor}` : undefined }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Box sx={{ mt: 0.5 }}>
        <Typography variant="h4" fontWeight={700}>
          {value}
        </Typography>
      </Box>
    </Paper>
  );
}
