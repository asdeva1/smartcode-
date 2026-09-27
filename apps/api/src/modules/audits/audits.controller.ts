import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@smartcode/types';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { parseExportFormat } from '../../common/export/export.service';
import { CSV_UPLOAD_LIMITS, type UploadedCsvFile } from '../../common/csv/csv-upload';
import { AuditsService } from './audits.service';
import {
  AuditQueueDto,
  CreateAuditDto,
  ExportAuditQueueDto,
  ExportAuditsDto,
  ListAuditsDto,
  ReauditDto,
  ResolveAuditDto,
  UpdateAuditDto,
} from './dto/audit.dto';

/** Coders have no route here at all; every write is additionally re-checked in AuditsService. */
@ApiTags('audits')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller()
export class AuditsController {
  constructor(private readonly audits: AuditsService) {}

  @Get('charts/:chartId/production')
  @Roles('AUDITOR', 'TEAM_LEAD', 'MANAGER')
  @ApiOperation({ summary: 'Auditor "Fetch": current production for a Chart ID with coder identity (read-only)' })
  lookup(@CurrentUser() caller: AuthUser, @Param('chartId') chartId: string) {
    return this.audits.lookup(caller, chartId);
  }

  @Get('auditor/queue')
  @Roles('AUDITOR')
  @ApiOperation({ summary: 'Charts awaiting audit in the caller\'s assigned projects, plus own in-progress audits' })
  queue(@CurrentUser() caller: AuthUser, @Query() query: AuditQueueDto) {
    return this.audits.queue(caller, query);
  }

  @Get('auditor/queue/export')
  @Roles('AUDITOR')
  @ApiOperation({ summary: 'Export the audit queue (format=csv|xlsx|pdf)' })
  exportQueue(@CurrentUser() caller: AuthUser, @Query() query: ExportAuditQueueDto) {
    return this.audits.exportQueue(caller, parseExportFormat(query.format), query);
  }

  @Post('audits')
  @Roles('AUDITOR')
  @ApiOperation({ summary: 'Create an audit from a Chart ID; totalErrors computed server-side' })
  create(@CurrentUser() caller: AuthUser, @Body() dto: CreateAuditDto) {
    return this.audits.create(caller, dto);
  }

  @Get('audits')
  @Roles('AUDITOR', 'TEAM_LEAD', 'MANAGER', 'VENDOR')
  @ApiOperation({ summary: 'List audits (own / team charts / all)' })
  list(@CurrentUser() caller: AuthUser, @Query() query: ListAuditsDto) {
    return this.audits.list(caller, query);
  }

  @Get('audits/export')
  @Roles('AUDITOR', 'TEAM_LEAD', 'MANAGER', 'VENDOR')
  @ApiOperation({ summary: 'Export scoped audits (format=csv|xlsx|pdf) honouring list filters' })
  export(@CurrentUser() caller: AuthUser, @Query() query: ExportAuditsDto) {
    return this.audits.export(caller, parseExportFormat(query.format), query);
  }

  @Post('audits/import/preview')
  @Roles('AUDITOR')
  @UseInterceptors(FileInterceptor('file', { limits: CSV_UPLOAD_LIMITS }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Validate an audit CSV and return a row-level preview; writes nothing' })
  importPreview(@CurrentUser() caller: AuthUser, @UploadedFile() file: UploadedCsvFile) {
    return this.audits.importPreview(caller, file);
  }

  @Post('audits/import')
  @Roles('AUDITOR')
  @UseInterceptors(FileInterceptor('file', { limits: CSV_UPLOAD_LIMITS }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import valid audit rows from a CSV in one transaction' })
  importCommit(@CurrentUser() caller: AuthUser, @UploadedFile() file: UploadedCsvFile) {
    return this.audits.importCommit(caller, file);
  }

  @Get('audits/:id')
  @Roles('AUDITOR', 'TEAM_LEAD', 'MANAGER', 'VENDOR')
  @ApiOperation({ summary: 'Get one scoped audit' })
  get(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.audits.get(caller, id);
  }

  @Patch('audits/:id')
  @Roles('AUDITOR')
  @ApiOperation({ summary: 'Auditor edits own PENDING/IN_PROGRESS audit; COMPLETED audits are immutable' })
  update(@CurrentUser() caller: AuthUser, @Param('id') id: string, @Body() dto: UpdateAuditDto) {
    return this.audits.update(caller, id, dto);
  }

  @Post('audits/:id/resolve')
  @Roles('TEAM_LEAD', 'MANAGER')
  @ApiOperation({ summary: 'Resolve a REVIEW_REQUIRED audit to COMPLETED or REJECTED' })
  resolve(@CurrentUser() caller: AuthUser, @Param('id') id: string, @Body() dto: ResolveAuditDto) {
    return this.audits.resolve(caller, id, dto);
  }

  @Post('audits/:id/reaudit')
  @Roles('AUDITOR', 'MANAGER')
  @ApiOperation({ summary: 'Re-audit a REJECTED audit - always creates a new audit row' })
  reaudit(@CurrentUser() caller: AuthUser, @Param('id') id: string, @Body() dto: ReauditDto) {
    return this.audits.reaudit(caller, id, dto);
  }
}
