'use client';
import * as React from 'react';
import MuiDrawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import Stack from '@mui/material/Stack';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
}

export function Drawer({ open, onClose, title, children, width = 420 }: DrawerProps) {
  return (
    <MuiDrawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width, p: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6" fontWeight={700}>
            {title}
          </Typography>
          <IconButton size="small" onClick={onClose} aria-label="Close">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
        {children}
      </Box>
    </MuiDrawer>
  );
}
