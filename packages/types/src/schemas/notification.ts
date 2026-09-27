/**
 * In-app notifications (existing Notification table). Created only by the
 * business event itself - never by reading a dashboard - and unique per
 * (recipient, type, entity) so the same event can never notify twice.
 */
export const NOTIFICATION_TYPES = [
  'REWORK_REQUESTED',
  'REWORK_STARTED',
  'REWORK_RESOLVED',
  'REWORK_READY_FOR_REAUDIT',
  'REWORK_WITHDRAWN',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface AppNotification {
  id: string;
  type: NotificationType | string;
  message: string;
  entity: string | null;
  entityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  data: AppNotification[];
  unread: number;
}
