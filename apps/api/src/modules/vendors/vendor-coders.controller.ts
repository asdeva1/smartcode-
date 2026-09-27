import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@smartcode/types';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CodersService } from '../users/coders.service';
import { UsersService } from '../users/users.service';
import { ListCodersDto } from '../users/dto/list-coders.dto';
import { UpdateCoderDto } from '../users/dto/update-coder.dto';
import { CreateCoderDto } from '../users/dto/create-coder.dto';

/**
 * Vendor Portal Coder management - docs/09-BUSINESS-RULES.md "Coder
 * Creation From Vendor Portal". VENDOR-only at the route; every method on
 * CodersService/UsersService re-derives the caller's own vendor from the
 * session (requireVendor) - a vendorId in the request is never trusted.
 * Creation stays a POST here (mirrors POST /team-leads/coders); everything
 * else reuses the same Team-Lead-facing CodersService, generalised to
 * scope by vendorId for a VENDOR caller.
 */
@ApiTags('vendor-coders')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('VENDOR')
@Controller('vendor/coders')
export class VendorCodersController {
  constructor(
    private readonly coders: CodersService,
    private readonly users: UsersService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Vendor lists Coders belonging to its own vendor - paginated, searchable, status filter' })
  list(@CurrentUser() caller: AuthUser, @Query() query: ListCodersDto) {
    return this.coders.list(caller, query);
  }

  @Post()
  @ApiOperation({ summary: "Vendor creates a Coder: vendorId is the caller's own vendor, teamId auto-follows the vendor's current Team Lead (if any)" })
  create(@CurrentUser() caller: AuthUser, @Body() dto: CreateCoderDto) {
    return this.users.createCoder(caller, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'View one own-vendor Coder, with assigned Team Lead, Project(s) and production stats' })
  get(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.coders.get(caller, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an own-vendor Coder (employee ID, full name, email)' })
  update(@CurrentUser() caller: AuthUser, @Param('id') id: string, @Body() dto: UpdateCoderDto) {
    return this.coders.update(caller, id, dto);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate an own-vendor Coder' })
  activate(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.users.setActive(caller, id, true);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate an own-vendor Coder' })
  deactivate(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.users.setActive(caller, id, false);
  }
}
