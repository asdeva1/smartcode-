import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
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
  @ApiOperation({ summary: 'List teams' })
  findAll() {
    return this.teamsService.findAll();
  }
}
