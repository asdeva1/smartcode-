import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@smartcode/types';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReworkService } from './rework.service';
import { ListReworkDto, ResolveReworkDto } from './dto/rework.dto';

/** Every read is row-scoped in ReworkService; only the owning Coder can resolve. */
@ApiTags('rework')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('MANAGER', 'TEAM_LEAD', 'CODER', 'AUDITOR', 'VENDOR')
@Controller('rework')
export class ReworkController {
  constructor(private readonly rework: ReworkService) {}

  @Get()
  @ApiOperation({ summary: 'List rework items in the caller scope (status=pending|OPEN|IN_PROGRESS|RESOLVED|REAUDITED|WITHDRAWN)' })
  list(@CurrentUser() caller: AuthUser, @Query() query: ListReworkDto) {
    return this.rework.list(caller, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Rework counts, unread count and latest items for dashboards (read-only)' })
  summary(@CurrentUser() caller: AuthUser, @Query('vendorId') vendorId?: string) {
    return this.rework.summary(caller, caller.role === 'MANAGER' ? vendorId || undefined : undefined);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One scoped rework item with its audit and production links' })
  get(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.rework.get(caller, id);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark the caller's notifications for this rework as read" })
  markRead(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.rework.markRead(caller, id);
  }

  @Post(':id/resolve')
  @Roles('CODER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Coder submits the corrected production and resolves their rework' })
  resolve(@CurrentUser() caller: AuthUser, @Param('id') id: string, @Body() dto: ResolveReworkDto) {
    return this.rework.resolve(caller, id, dto);
  }
}
