import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@smartcode/types';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LoginNameAllocationService } from './login-name-allocation.service';
import { ListLoginNameAllocationsDto } from './dto/login-name-allocation.dto';

/**
 * Manager-only Login Name Details (docs/09-BUSINESS-RULES.md section 10 /
 * Phase 9). Search/list is server-side paginated (defaults to the live
 * ACTIVE directory); the detail route returns the current allocation
 * (if any) plus the complete history for one exact Login Name, in a
 * single response, since the detail view always needs both together.
 */
@ApiTags('login-name-allocations')
@Controller('manager/login-name-allocations')
@UseGuards(RolesGuard)
@Roles('MANAGER')
@ApiBearerAuth()
export class LoginNameAllocationController {
  constructor(private readonly allocations: LoginNameAllocationService) {}

  @Get()
  @ApiOperation({ summary: 'Manager searches/lists Login Name allocations (defaults to the current ACTIVE directory)' })
  list(@CurrentUser() caller: AuthUser, @Query() query: ListLoginNameAllocationsDto) {
    return this.allocations.list(caller, query);
  }

  @Get(':loginName')
  @ApiOperation({ summary: 'Manager views the current allocation and complete history for one Login Name' })
  getByLoginName(@CurrentUser() caller: AuthUser, @Param('loginName') loginName: string) {
    return this.allocations.getByLoginName(caller, loginName);
  }
}
