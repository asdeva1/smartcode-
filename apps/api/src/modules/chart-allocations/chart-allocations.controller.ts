import { Body, Controller, Get, Param, Post, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@smartcode/types';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CHART_ALLOCATION_UPLOAD_LIMITS, type UploadedChartAllocationFile } from '../../common/chart-allocation/chart-allocation-upload';
import { ChartAllocationsService } from './chart-allocations.service';
import {
  ExportChartAllocationsDto,
  ListChartAllocationHistoryDto,
  ListChartAllocationsDto,
  PullbackChartAllocationDto,
  ReassignChartAllocationDto,
} from './dto/chart-allocation.dto';

/**
 * Phase 10D — Chart Allocation (docs/09-BUSINESS-RULES.md section 12).
 *
 * Manager: browse/filter a MANUAL project's charts and export the Summary
 * workbook/CSV (blank "Assigned to", fixed "Shift 1").
 * Team Lead: preview/commit the filled-in Summary re-upload (all-or-nothing),
 * pull back or reassign an active allocation.
 * Both: allocation history, allocation-import history, and raw-count
 * allocation metrics. Per-method @Roles narrows the class-level default.
 *
 * This is a new, separate controller/route - it does NOT replace or modify
 * ChartImportsController/ChartImportsService (the client Raw-file ingestion
 * path, Phase 10A-10B), and does NOT touch apps/web ChartRepository.tsx.
 */
@ApiTags('chart-allocations')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('MANAGER', 'TEAM_LEAD')
@Controller('projects/:projectId/chart-allocations')
export class ChartAllocationsController {
  constructor(private readonly chartAllocations: ChartAllocationsService) {}

  @Get()
  @ApiOperation({ summary: 'List a MANUAL project\'s charts for allocation, with current-allocation state' })
  list(@CurrentUser() caller: AuthUser, @Param('projectId') projectId: string, @Query() query: ListChartAllocationsDto) {
    return this.chartAllocations.listAllocatable(caller, projectId, query);
  }

  @Get('export')
  @Roles('MANAGER')
  @ApiOperation({ summary: 'Manager: export the filtered Summary workbook/CSV (blank Assigned to, fixed Shift 1)' })
  async export(@CurrentUser() caller: AuthUser, @Param('projectId') projectId: string, @Query() query: ExportChartAllocationsDto) {
    const file = await this.chartAllocations.exportSummary(caller, projectId, query);
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.buffer.length,
    });
  }

  @Post('preview')
  @Roles('TEAM_LEAD')
  @UseInterceptors(FileInterceptor('file', { limits: CHART_ALLOCATION_UPLOAD_LIMITS }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Team Lead: validate a filled-in Summary re-upload and return a row-level preview; writes nothing but an audit log' })
  preview(@CurrentUser() caller: AuthUser, @Param('projectId') projectId: string, @UploadedFile() file: UploadedChartAllocationFile) {
    return this.chartAllocations.previewAllocationUpload(caller, projectId, file);
  }

  @Post()
  @Roles('TEAM_LEAD')
  @UseInterceptors(FileInterceptor('file', { limits: CHART_ALLOCATION_UPLOAD_LIMITS }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Team Lead: commit a filled-in Summary re-upload - all rows valid or the whole file is rejected, in one transaction' })
  commit(@CurrentUser() caller: AuthUser, @Param('projectId') projectId: string, @UploadedFile() file: UploadedChartAllocationFile) {
    return this.chartAllocations.commitAllocationUpload(caller, projectId, file);
  }

  @Get('history')
  @ApiOperation({ summary: 'Append-only allocation ledger for this Project, most recent first' })
  history(@CurrentUser() caller: AuthUser, @Param('projectId') projectId: string, @Query() query: ListChartAllocationHistoryDto) {
    return this.chartAllocations.listHistory(caller, projectId, query);
  }

  @Get('import-history')
  @ApiOperation({ summary: 'Team Lead Summary-upload history for this Project, most recent first' })
  importHistory(@CurrentUser() caller: AuthUser, @Param('projectId') projectId: string, @Query() query: ListChartAllocationHistoryDto) {
    return this.chartAllocations.listImportHistory(caller, projectId, query);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Raw allocation counts (allocated/done/pending, overall and by Coder) - no invented production-percentage formula' })
  metrics(@CurrentUser() caller: AuthUser, @Param('projectId') projectId: string) {
    return this.chartAllocations.metrics(caller, projectId);
  }

  @Post(':chartId/pullback')
  @ApiOperation({ summary: 'End a Chart\'s active allocation explicitly, preserving history; blocked by completed production or live rework' })
  pullback(
    @CurrentUser() caller: AuthUser,
    @Param('projectId') projectId: string,
    @Param('chartId') chartId: string,
    @Body() dto: PullbackChartAllocationDto,
  ) {
    return this.chartAllocations.pullback(caller, projectId, chartId, dto);
  }

  @Post(':chartId/reassign')
  @ApiOperation({ summary: 'Atomically end the current allocation and create a new one for a different, validated Coder' })
  reassign(
    @CurrentUser() caller: AuthUser,
    @Param('projectId') projectId: string,
    @Param('chartId') chartId: string,
    @Body() dto: ReassignChartAllocationDto,
  ) {
    return this.chartAllocations.reassign(caller, projectId, chartId, dto);
  }
}
