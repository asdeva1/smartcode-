import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@smartcode/types';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApprovalsService } from './approvals.service';
import { ListApprovalsDto, RejectApprovalDto, RequestLoginNameChangeDto } from './dto/approval.dto';

@ApiTags('approvals')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller()
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Post('team-leads/coders/:id/login-name-request')
  @Roles('TEAM_LEAD')
  @ApiOperation({ summary: 'Team Lead requests a Login Name change for an own-team Coder - requires Manager approval' })
  requestLoginNameChange(@CurrentUser() caller: AuthUser, @Param('id') id: string, @Body() dto: RequestLoginNameChangeDto) {
    return this.approvals.requestLoginNameChange(caller, id, dto);
  }

  @Get('manager/approvals')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager lists approval requests (defaults to pending)' })
  list(@CurrentUser() caller: AuthUser, @Query() query: ListApprovalsDto) {
    return this.approvals.list(caller, query);
  }

  @Patch('manager/approvals/:id/approve')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager approves a request, applying the change' })
  approve(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.approvals.approve(caller, id);
  }

  @Patch('manager/approvals/:id/reject')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager rejects a request; the change never applies' })
  reject(@CurrentUser() caller: AuthUser, @Param('id') id: string, @Body() dto: RejectApprovalDto) {
    return this.approvals.reject(caller, id, dto.reason);
  }
}
