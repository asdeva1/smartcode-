import { Controller, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@smartcode/types';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CHART_IMPORT_UPLOAD_LIMITS, type UploadedChartImportFile } from '../../common/chart-import/chart-import-upload';
import { ChartImportsService } from './chart-imports.service';
import { ListChartImportsDto } from './dto/list-chart-imports.dto';

/**
 * Phase 10A-10B — Client File Driven Chart Import (docs/09-BUSINESS-RULES.md
 * section 11). Manager-only, scoped to one Project. Does NOT implement the
 * Manager Allocation Summary export/workspace (Phase 10C) or the future
 * Team-Lead Summary-upload/"Assigned to" workflow (Phase 10D).
 */
@ApiTags('chart-imports')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('MANAGER')
@Controller('projects/:projectId/chart-imports')
export class ChartImportsController {
  constructor(private readonly chartImports: ChartImportsService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { limits: CHART_IMPORT_UPLOAD_LIMITS }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Validate a client CSV/Excel chart file and return a row-level preview; writes nothing but an audit log' })
  preview(@CurrentUser() caller: AuthUser, @Param('projectId') projectId: string, @UploadedFile() file: UploadedChartImportFile) {
    return this.chartImports.preview(caller, projectId, file);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: CHART_IMPORT_UPLOAD_LIMITS }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import valid chart rows from a CSV/Excel file into this Project in one transaction' })
  commit(@CurrentUser() caller: AuthUser, @Param('projectId') projectId: string, @UploadedFile() file: UploadedChartImportFile) {
    return this.chartImports.commit(caller, projectId, file);
  }

  @Get()
  @ApiOperation({ summary: 'Import history for this Project, most recent first' })
  list(@CurrentUser() caller: AuthUser, @Param('projectId') projectId: string, @Query() query: ListChartImportsDto) {
    return this.chartImports.listHistory(caller, projectId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One import history record, including its capped validation-message summary' })
  detail(@CurrentUser() caller: AuthUser, @Param('projectId') projectId: string, @Param('id') id: string) {
    return this.chartImports.getHistoryDetail(caller, projectId, id);
  }
}
