'use client';
import * as React from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import { Bell, LogOut, ChevronDown } from 'lucide-react';
import type { AuthUser } from '@smartcode/types';
import { useLogout } from '@/features/auth/use-auth';

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
        {/* Notifications placeholder - full module lands in Phase 7, see docs/10 */}
        <IconButton size="small" aria-label="Notifications">
          <Bell size={18} />
        </IconButton>
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
              {user.employeeId} | {user.role.replace('_', ' ')}
            </Typography>
          </Box>
          <ChevronDown size={16} />
        </Box>
        <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
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
