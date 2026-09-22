'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import * as Icons from 'lucide-react';
import type { Role } from '@smartcode/types';
import { NAVIGATION } from '@smartcode/config';

const SIDEBAR_WIDTH = 240;

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = NAVIGATION[role];

  return (
    <Box
      component="nav"
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        borderRight: '1px solid',
        borderColor: 'divider',
        height: '100vh',
        position: 'sticky',
        top: 0,
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ px: 2, py: 2.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* Brand logo asset lives at public/smartclues-logo.png - see brief Section 12 */}
        <img src="/smartclues-logo.png" alt="SmartClues Technologies" height={24} />
      </Box>
      <List sx={{ px: 1, flex: 1 }}>
        {items.map((item) => {
          const Icon = (Icons as any)[item.icon] ?? Icons.Circle;
          const active = pathname === item.href;
          return (
            <ListItemButton
              key={item.href}
              component={Link}
              href={item.href}
              selected={active}
              sx={{
                borderRadius: 1,
                mb: 0.25,
                '&.Mui-selected': { bgcolor: 'primary.light', color: 'primary.dark' },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Icon size={18} />
              </ListItemIcon>
              <ListItemText
                primary={<Typography variant="body2">{item.label}</Typography>}
              />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );
}
