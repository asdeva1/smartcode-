'use client';
import * as React from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import { LogOut, ChevronDown, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { ROLE_LABELS, type AuthUser } from '@smartcode/types';
import { useLogout } from '@/features/auth/use-auth';
import { NotificationBell } from '@/features/notifications/NotificationBell';

export function TopNav({ user }: { user: AuthUser }) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const logout = useLogout();

  const initials = user.employeeId.slice(-2);

  return (
    <AppBar
      position="sticky"
      color="inherit"
      elevation={0}
      sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
    >
      <Toolbar sx={{ justifyContent: 'flex-end', gap: 1 }}>
        <NotificationBell role={user.role} />
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', pl: 1 }}
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          <Avatar sx={{ width: 30, height: 30, fontSize: '0.75rem', bgcolor: 'primary.main' }}>
            {initials}
          </Avatar>
          <Box>
            <Typography variant="body2" fontWeight={600} lineHeight={1.2}>
              {user.loginName}
            </Typography>
            <Typography variant="caption" color="text.secondary" lineHeight={1.2}>
              {user.employeeId} | {ROLE_LABELS[user.role]}
            </Typography>
          </Box>
          <ChevronDown size={16} />
        </Box>
        <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
          {user.role === 'MANAGER' && (
            <MenuItem component={Link} href="/manager/settings" onClick={() => setAnchorEl(null)}>
              <KeyRound size={16} style={{ marginRight: 8 }} />
              Reset Password
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              setAnchorEl(null);
              logout.mutate();
            }}
          >
            <LogOut size={16} style={{ marginRight: 8 }} />
            Logout
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
