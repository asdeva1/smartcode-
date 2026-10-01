import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@smartcode/types';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgContextService } from './org-context.service';

/**
 * "Organization Assignment + Auto-Visibility" requirement - a single
 * `GET /me/context` every role's dashboard/workspace calls on load to get
 * its current authorized Vendor/Team/Team Lead/Project(s), instead of the
 * forbidden "Login -> Select Project -> Select Team -> Select Coder"
 * flow. No @Roles() restriction - every authenticated role calls this
 * with its own identity; OrgContextService branches on caller.role and
 * never trusts anything from the request body/query.
 */
@ApiTags('org-context')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('me')
export class OrgContextController {
  constructor(private readonly orgContext: OrgContextService) {}

  @Get('context')
  @ApiOperation({ summary: "Return the caller's current authorized organizational context (Vendor/Team/Team Lead/Project(s)) - backend-derived, never user-selected" })
  me(@CurrentUser() caller: AuthUser) {
    return this.orgContext.me(caller);
  }
}
