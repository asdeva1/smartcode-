import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@smartcode/types';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { parseExportFormat } from '../../common/export/export.service';
import { ChartsService } from './charts.service';
import { ExportChartsDto, ListChartsDto } from './dto/list-charts.dto';

@ApiTags('charts')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('MANAGER', 'TEAM_LEAD', 'CODER', 'AUDITOR', 'VENDOR')
@Controller('charts')
export class ChartsController {
  constructor(private readonly charts: ChartsService) {}

  @Get()
  @ApiOperation({ summary: 'Chart Repository - scoped, searchable, filterable, paginated' })
  list(@CurrentUser() caller: AuthUser, @Query() query: ListChartsDto) {
    return this.charts.list(caller, query);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export scoped charts (format=csv|xlsx|pdf) honouring filters' })
  export(@CurrentUser() caller: AuthUser, @Query() query: ExportChartsDto) {
    return this.charts.export(caller, parseExportFormat(query.format), query);
  }

  @Get(':chartId')
  @ApiOperation({ summary: 'Chart detail with production and audit history' })
  get(@CurrentUser() caller: AuthUser, @Param('chartId') chartId: string) {
    return this.charts.get(caller, chartId);
  }

  @Get(':chartId/production-history')
  @ApiOperation({ summary: 'All production versions of a chart, newest first' })
  productionHistory(@CurrentUser() caller: AuthUser, @Param('chartId') chartId: string) {
    return this.charts.productionHistory(caller, chartId);
  }

  @Get(':chartId/audit-history')
  @Roles('MANAGER', 'TEAM_LEAD', 'AUDITOR', 'VENDOR')
  @ApiOperation({ summary: 'Every audit ever recorded on a chart, newest first (re-audits preserved)' })
  auditHistory(@CurrentUser() caller: AuthUser, @Param('chartId') chartId: string) {
    return this.charts.auditHistory(caller, chartId);
  }
}
