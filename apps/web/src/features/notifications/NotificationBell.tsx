'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { Bell } from 'lucide-react';
import type { AppNotification, Role } from '@smartcode/types';
import { formatDateTime } from '@/lib/format';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from './use-notifications';

const REWORK_PAGE: Record<Role, string> = {
  MANAGER: '/manager/rework',
  TEAM_LEAD: '/team-lead/rework',
  CODER: '/coder/rework',
  AUDITOR: '/auditor/rework',
  VENDOR: '/vendor/rework',
};

/** Top-bar bell: unread count, latest notifications, click to open the related rework. */
export function NotificationBell({ role }: { role: Role }) {
  const router = useRouter();
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const { data } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const unread = data?.unread ?? 0;

  const open = (n: AppNotification) => {
    setAnchor(null);
    if (!n.isRead) markRead.mutate(n.id);
    if (n.entity === 'Rework' && n.entityId) router.push(`${REWORK_PAGE[role]}?open=${encodeURIComponent(n.entityId)}`);
  };

  return (
    <>
      <IconButton size="small" aria-label={unread ? `Notifications (${unread} unread)` : 'Notifications'} onClick={(e) => setAnchor(e.currentTarget)}>
        <Badge color="error" badgeContent={unread} max={99}>
          <Bell size={18} />
        </Badge>
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { width: 360, maxWidth: '90vw' } } }}>
        <Box sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2" fontWeight={700}>
            Notifications
          </Typography>
          {unread > 0 && (
            <Typography
              component="button"
              variant="caption"
              onClick={() => markAll.mutate()}
              sx={{ border: 0, background: 'none', color: 'primary.main', cursor: 'pointer' }}
            >
              Mark all read
            </Typography>
          )}
        </Box>
        <Divider />
        {(data?.data ?? []).length === 0 && (
          <MenuItem disabled>
            <Typography variant="body2">No notifications</Typography>
          </MenuItem>
        )}
        {(data?.data ?? []).map((n) => (
          <MenuItem key={n.id} onClick={() => open(n)} sx={{ whiteSpace: 'normal', alignItems: 'flex-start', bgcolor: n.isRead ? undefined : 'action.hover' }}>
            <Box>
              <Typography variant="body2" fontWeight={n.isRead ? 400 : 700}>
                {n.message}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatDateTime(n.createdAt)}
              </Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
