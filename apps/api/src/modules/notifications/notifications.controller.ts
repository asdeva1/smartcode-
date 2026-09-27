import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@smartcode/types';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('MANAGER', 'TEAM_LEAD', 'CODER', 'AUDITOR', 'VENDOR')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "The caller's own notifications, newest first, with the unread count" })
  list(@CurrentUser() caller: AuthUser, @Query('unreadOnly') unreadOnly?: string, @Query('limit') limit?: string) {
    return this.notifications.list(caller, unreadOnly === 'true', limit ? Number(limit) || 20 : 20);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark all of the caller's notifications read" })
  markAllRead(@CurrentUser() caller: AuthUser) {
    return this.notifications.markAllRead(caller);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark one of the caller\'s notifications read' })
  markRead(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(caller, id);
  }
}
