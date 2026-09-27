import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The caller's own in-app notifications (existing Notification table).
 * Notifications are created only by business events (see
 * rework/rework.workflow.ts); these endpoints only read and mark them.
 * Every query is filtered by userId = caller - another user's
 * notification id returns 404.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(caller: AuthUser, unreadOnly = false, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 100);
    const [data, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: caller.id, ...(unreadOnly ? { isRead: false } : {}) },
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, type: true, message: true, entity: true, entityId: true, isRead: true, readAt: true, createdAt: true },
      }),
      this.prisma.notification.count({ where: { userId: caller.id, isRead: false } }),
    ]);
    return { data, unread };
  }

  async markRead(caller: AuthUser, id: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId: caller.id },
      data: { isRead: true, readAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Notification not found');
    return { id, isRead: true };
  }

  async markAllRead(caller: AuthUser) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId: caller.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { markedRead: count };
  }
}
