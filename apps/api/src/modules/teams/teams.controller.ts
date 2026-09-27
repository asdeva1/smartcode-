import { Controller, Post, Get, Body, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { AuthUser } from '@smartcode/types';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('teams')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager creates a Team' })
  create(@CurrentUser() caller: AuthUser, @Body() dto: CreateTeamDto) {
    return this.teamsService.create(caller, dto);
  }

  @Get()
  @Roles('MANAGER', 'TEAM_LEAD')
  @ApiOperation({ summary: 'List teams (Manager may filter by vendorId)' })
  findAll(@CurrentUser() caller: AuthUser, @Query('vendorId') vendorId?: string) {
    if (vendorId && !isUUID(vendorId)) throw new BadRequestException('vendorId must be a UUID');
    return this.teamsService.findAll(caller.role === 'MANAGER' ? vendorId || undefined : undefined);
  }
}
