import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@smartcode/types';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { parseExportFormat } from '../../common/export/export.service';
import { CSV_UPLOAD_LIMITS, type UploadedCsvFile } from '../../common/csv/csv-upload';
import { CodersService } from './coders.service';
import { ExportCodersDto, ListCodersDto } from './dto/list-coders.dto';
import { UpdateCoderDto } from './dto/update-coder.dto';

/**
 * Team Lead Coder management. Creation stays at POST /team-leads/coders
 * (UsersController). Everything here is TEAM_LEAD-only at the route and
 * re-scoped to the caller's team in CodersService.
 */
@ApiTags('coders')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('TEAM_LEAD')
@Controller('team-leads/coders')
export class CodersController {
  constructor(private readonly coders: CodersService) {}

  @Get()
  @ApiOperation({ summary: 'Team Lead lists own team Coders - paginated, searchable, status filter' })
  list(@CurrentUser() caller: AuthUser, @Query() query: ListCodersDto) {
    return this.coders.list(caller, query);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export own team Coders (format=csv|xlsx|pdf), honouring search/status filters' })
  export(@CurrentUser() caller: AuthUser, @Query() query: ExportCodersDto) {
    return this.coders.export(caller, parseExportFormat(query.format), query);
  }

  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file', { limits: CSV_UPLOAD_LIMITS }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Validate a Coder CSV and return a row-level preview; writes nothing' })
  importPreview(@CurrentUser() caller: AuthUser, @UploadedFile() file: UploadedCsvFile) {
    return this.coders.importPreview(caller, file);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: CSV_UPLOAD_LIMITS }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import valid Coder rows from a CSV in one transaction' })
  importCommit(@CurrentUser() caller: AuthUser, @UploadedFile() file: UploadedCsvFile) {
    return this.coders.importCommit(caller, file);
  }

  @Get(':id')
  @ApiOperation({ summary: 'View one own-team Coder with production stats' })
  get(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.coders.get(caller, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an own-team Coder (employee ID, full name, email)' })
  update(@CurrentUser() caller: AuthUser, @Param('id') id: string, @Body() dto: UpdateCoderDto) {
    return this.coders.update(caller, id, dto);
  }
}
