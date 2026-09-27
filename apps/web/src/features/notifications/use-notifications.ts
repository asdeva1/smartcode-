'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationListResponse } from '@smartcode/types';
import { apiFetch } from '@/lib/api-client';

/** The caller's own notifications. Polls gently; reading never creates notifications. */
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => apiFetch<NotificationListResponse>('/notifications?limit=10'),
    refetchInterval: 60_000,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['rework'] });
  };
}

export function useMarkNotificationRead() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => invalidate(),
  });
}

export function useMarkAllNotificationsRead() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => apiFetch('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => invalidate(),
  });
}
