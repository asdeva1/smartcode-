import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@smartcode/types';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { requireVendor } from '../../common/vendor-scope';
import { VendorsService } from './vendors.service';
import {
  AssignVendorUserDto,
  AssignableQueryDto,
  CreateVendorAccountDto,
  CreateVendorDto,
  ListVendorsDto,
  UpdateVendorDto,
  VendorActivityQueryDto,
  VendorDashboardQueryDto,
} from './dto/vendor.dto';

/**
 * /vendors/*  - Manager vendor management (MANAGER only).
 * /vendor/*   - a Vendor account's own read-only portal (VENDOR only). The
 *               vendor id is always taken from the session, so a Vendor
 *               can never address another vendor.
 */
@ApiTags('vendors')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller()
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  // ─── Manager ────────────────────────────────────────────────

  @Get('vendors')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager lists vendors - paginated, searchable, status filter' })
  list(@CurrentUser() caller: AuthUser, @Query() query: ListVendorsDto) {
    return this.vendors.list(caller, query);
  }

  @Get('vendors/options')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'All vendors (id, name, code, status) for filter dropdowns' })
  options(@CurrentUser() caller: AuthUser) {
    return this.vendors.options(caller);
  }

  @Get('vendors/overview')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Per-vendor structure and workload for the Manager dashboard' })
  overview(@CurrentUser() caller: AuthUser) {
    return this.vendors.overview(caller);
  }

  @Post('vendors')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager creates a vendor' })
  create(@CurrentUser() caller: AuthUser, @Body() dto: CreateVendorDto) {
    return this.vendors.create(caller, dto);
  }

  @Get('vendors/:id')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Vendor detail with assigned Team Leads, Auditors and vendor accounts' })
  get(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.vendors.get(caller, id);
  }

  @Patch('vendors/:id')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager edits a vendor (the code is permanent)' })
  update(@CurrentUser() caller: AuthUser, @Param('id') id: string, @Body() dto: UpdateVendorDto) {
    return this.vendors.update(caller, id, dto);
  }

  @Patch('vendors/:id/activate')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Activate a vendor' })
  activate(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.vendors.setActive(caller, id, true);
  }

  @Patch('vendors/:id/deactivate')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Deactivate a vendor (its vendor accounts are locked out; data is kept)' })
  deactivate(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.vendors.setActive(caller, id, false);
  }

  @Get('vendors/:id/structure')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Vendor team structure: Team Leads -> teams -> coders/projects, and Auditors' })
  structure(@CurrentUser() _caller: AuthUser, @Param('id') id: string) {
    return this.vendors.structure(id);
  }

  @Get('vendors/:id/activity')
  @Roles('MANAGER')
  @ApiOperation({ summary: "Vendor operational activity from the audit log (vendor's own people and admin events)" })
  activity(@Param('id') id: string, @Query() query: VendorActivityQueryDto) {
    return this.vendors.activity(id, query.page, query.pageSize);
  }

  @Get('vendors/:id/dashboard')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'One vendor\'s dashboard metrics (Manager view)' })
  managerVendorDashboard(@Param('id') id: string, @Query() query: VendorDashboardQueryDto) {
    return this.vendors.dashboard(id, query.today);
  }

  @Get('vendors/:id/assignable')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Active Team Leads / Auditors not assigned to any vendor' })
  assignable(@CurrentUser() caller: AuthUser, @Param('id') id: string, @Query() query: AssignableQueryDto) {
    return this.vendors.assignable(caller, id, query.role);
  }

  @Post('vendors/:id/team-leads')
  @Roles('MANAGER')
  @ApiOperation({ summary: "Assign (or change) the vendor's Team Lead - all active Coders under this vendor automatically move onto them" })
  assignTeamLead(@CurrentUser() caller: AuthUser, @Param('id') id: string, @Body() dto: AssignVendorUserDto) {
    return this.vendors.assignTeamLead(caller, id, dto.userId);
  }

  @Delete('vendors/:id/team-leads/:userId')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Remove a Team Lead assignment (kept as history, audit-logged); the vendor\'s active Coders are detached, not left stale' })
  removeTeamLead(@CurrentUser() caller: AuthUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.vendors.removeTeamLead(caller, id, userId);
  }

  @Post('vendors/:id/auditors')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Assign an Auditor to the vendor' })
  assignAuditor(@CurrentUser() caller: AuthUser, @Param('id') id: string, @Body() dto: AssignVendorUserDto) {
    return this.vendors.assign(caller, id, 'AUDITOR', dto.userId);
  }

  @Delete('vendors/:id/auditors/:userId')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Remove an Auditor assignment (kept as history, audit-logged)' })
  removeAuditor(@CurrentUser() caller: AuthUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.vendors.unassign(caller, id, 'AUDITOR', userId);
  }

  @Post('vendors/:id/accounts')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Create a Vendor login account for this vendor' })
  createAccount(@CurrentUser() caller: AuthUser, @Param('id') id: string, @Body() dto: CreateVendorAccountDto) {
    return this.vendors.createAccount(caller, id, dto);
  }

  // ─── Vendor's own portal ────────────────────────────────────

  @Get('vendor/me')
  @Roles('VENDOR')
  @ApiOperation({ summary: 'The caller\'s own vendor with its Team Leads, Auditors and accounts' })
  me(@CurrentUser() caller: AuthUser) {
    return this.vendors.detail(requireVendor(caller));
  }

  @Get('vendor/structure')
  @Roles('VENDOR')
  @ApiOperation({ summary: 'The caller\'s own vendor team structure' })
  myStructure(@CurrentUser() caller: AuthUser) {
    return this.vendors.structure(requireVendor(caller));
  }

  @Get('vendor/dashboard')
  @Roles('VENDOR')
  @ApiOperation({ summary: 'The caller\'s own vendor dashboard' })
  myDashboard(@CurrentUser() caller: AuthUser, @Query() query: VendorDashboardQueryDto) {
    return this.vendors.dashboard(requireVendor(caller), query.today);
  }
}
