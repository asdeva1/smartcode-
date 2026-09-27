import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@smartcode/types';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProjectsService } from './projects.service';
import { CreateAuditorAssignmentDto, CreateClientDto, CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('manager/clients')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager lists clients' })
  listClients(@CurrentUser() caller: AuthUser) {
    return this.projects.listClients(caller);
  }

  @Post('manager/clients')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager creates a client' })
  createClient(@CurrentUser() caller: AuthUser, @Body() dto: CreateClientDto) {
    return this.projects.createClient(caller, dto);
  }

  @Get('manager/projects')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager lists projects with team and assignment counts' })
  listProjects(@CurrentUser() caller: AuthUser) {
    return this.projects.listProjects(caller);
  }

  @Post('manager/projects')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager creates a project and optionally assigns its team' })
  createProject(@CurrentUser() caller: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.createProject(caller, dto);
  }

  @Patch('manager/projects/:id')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager renames a project, changes its team, or (de)activates it' })
  updateProject(@CurrentUser() caller: AuthUser, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.updateProject(caller, id, dto);
  }

  @Get('manager/auditor-assignments')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager lists Auditor -> Project assignments' })
  listAssignments(@CurrentUser() caller: AuthUser) {
    return this.projects.listAssignments(caller);
  }

  @Post('manager/auditor-assignments')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager assigns an Auditor to a Project' })
  createAssignment(@CurrentUser() caller: AuthUser, @Body() dto: CreateAuditorAssignmentDto) {
    return this.projects.createAssignment(caller, dto);
  }

  @Delete('manager/auditor-assignments/:id')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager removes an Auditor -> Project assignment' })
  deleteAssignment(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.projects.deleteAssignment(caller, id);
  }

  @Get('projects/mine')
  @Roles('MANAGER', 'TEAM_LEAD', 'CODER', 'AUDITOR', 'VENDOR')
  @ApiOperation({ summary: 'Active projects the caller works in' })
  mine(@CurrentUser() caller: AuthUser) {
    return this.projects.mine(caller);
  }
}
