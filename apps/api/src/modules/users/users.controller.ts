import { Controller, Post, Get, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { AuthUser } from '@smartcode/types';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateTeamLeadDto } from './dto/create-team-lead.dto';
import { UpdateTeamLeadDto } from './dto/update-team-lead.dto';
import { ListTeamLeadsDto } from './dto/list-team-leads.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('manager/team-leads')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager creates a Team Lead' })
  createTeamLead(@CurrentUser() caller: AuthUser, @Body() dto: CreateTeamLeadDto) {
    return this.usersService.createTeamLead(caller, dto);
  }

  @Get('manager/team-leads')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager lists Team Leads - paginated, searchable, filterable' })
  listTeamLeads(@CurrentUser() caller: AuthUser, @Query() query: ListTeamLeadsDto) {
    return this.usersService.findTeamLeads(caller, query);
  }

  @Patch('manager/team-leads/:id')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager edits a Team Lead account' })
  updateTeamLead(
    @CurrentUser() caller: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTeamLeadDto,
  ) {
    return this.usersService.updateTeamLead(caller, id, dto);
  }

  @Post('manager/auditors')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager creates an Auditor' })
  createAuditor(@CurrentUser() caller: AuthUser, @Body() dto: CreateUserDto) {
    return this.usersService.createWithRole(caller, 'AUDITOR', dto);
  }

  @Post('team-leads/coders')
  @Roles('TEAM_LEAD')
  @ApiOperation({ summary: 'Team Lead creates a Coder, auto-assigned to their team' })
  createCoder(@CurrentUser() caller: AuthUser, @Body() dto: CreateUserDto) {
    return this.usersService.createWithRole(caller, 'CODER', dto);
  }

  @Get('users')
  @Roles('MANAGER', 'TEAM_LEAD', 'CODER', 'AUDITOR')
  @ApiOperation({ summary: 'List users, scoped to the caller\'s visibility' })
  findAll(@CurrentUser() caller: AuthUser) {
    return this.usersService.findScoped(caller);
  }

  @Patch('users/:id/activate')
  @Roles('MANAGER', 'TEAM_LEAD')
  @ApiOperation({ summary: 'Activate a user (Manager: TL/Auditor, TL: own Coders)' })
  activate(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.usersService.setActive(caller, id, true);
  }

  @Patch('users/:id/deactivate')
  @Roles('MANAGER', 'TEAM_LEAD')
  @ApiOperation({ summary: 'Deactivate a user (Manager: TL/Auditor, TL: own Coders)' })
  deactivate(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.usersService.setActive(caller, id, false);
  }
}
