import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@smartcode/types';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { parseExportFormat } from '../../common/export/export.service';
import { ReportsService } from './reports.service';
import { DashboardQueryDto, ExportReportDto, ReportQueryDto } from './dto/report.dto';

/** Which report a role may run is checked against REPORTS_BY_ROLE in ReportsService. */
@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('MANAGER', 'TEAM_LEAD', 'CODER', 'AUDITOR', 'VENDOR')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  // Vendors have their own scoped dashboard at GET /vendor/dashboard.
  @Roles('MANAGER', 'TEAM_LEAD', 'CODER', 'AUDITOR')
  @ApiOperation({ summary: 'Role-specific dashboard metrics from real data' })
  dashboard(@CurrentUser() caller: AuthUser, @Query() query: DashboardQueryDto) {
    return this.reports.dashboard(caller, query.today);
  }

  @Get(':report')
  @ApiOperation({ summary: 'Run a role-scoped report (see REPORTS_BY_ROLE) with period, grouping and role-authorised filters' })
  report(@CurrentUser() caller: AuthUser, @Param('report') report: string, @Query() query: ReportQueryDto) {
    return this.reports.report(caller, report, query);
  }

  @Get(':report/export')
  @ApiOperation({ summary: 'Export a role-scoped report (format=csv|xlsx|pdf)' })
  export(@CurrentUser() caller: AuthUser, @Param('report') report: string, @Query() query: ExportReportDto) {
    const { format, ...rest } = query;
    return this.reports.export(caller, report, parseExportFormat(format), rest);
  }
}
