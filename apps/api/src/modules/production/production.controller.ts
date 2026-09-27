import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@smartcode/types';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { parseExportFormat } from '../../common/export/export.service';
import { ProductionService } from './production.service';
import { CreateProductionDto, ExportProductionDto, ListProductionDto, UpdateProductionDto } from './dto/production.dto';

/** Vendors are read-only here (scoped to their vendor). Auditors are never allowed here - they read production only through GET /charts/:chartId/production. */
@ApiTags('production')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('production')
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Post()
  @Roles('CODER')
  @ApiOperation({ summary: 'Coder enters production; coder identity comes from the session' })
  create(@CurrentUser() caller: AuthUser, @Body() dto: CreateProductionDto) {
    return this.production.create(caller, dto);
  }

  @Get()
  @Roles('MANAGER', 'TEAM_LEAD', 'CODER', 'VENDOR')
  @ApiOperation({ summary: 'List production (own / team / all), current versions unless includeHistory' })
  list(@CurrentUser() caller: AuthUser, @Query() query: ListProductionDto) {
    return this.production.list(caller, query);
  }

  @Get('export')
  @Roles('MANAGER', 'TEAM_LEAD', 'CODER', 'VENDOR')
  @ApiOperation({ summary: 'Export scoped production (format=csv|xlsx|pdf) honouring list filters' })
  export(@CurrentUser() caller: AuthUser, @Query() query: ExportProductionDto) {
    return this.production.export(caller, parseExportFormat(query.format), query);
  }

  @Get(':id')
  @Roles('MANAGER', 'TEAM_LEAD', 'CODER', 'VENDOR')
  @ApiOperation({ summary: 'Get one scoped production entry' })
  get(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.production.get(caller, id);
  }

  @Patch(':id')
  @Roles('CODER')
  @ApiOperation({ summary: 'Coder edits own current version while PENDING / IN_PROGRESS / REWORK' })
  update(@CurrentUser() caller: AuthUser, @Param('id') id: string, @Body() dto: UpdateProductionDto) {
    return this.production.update(caller, id, dto);
  }

  @Post(':id/rework')
  @Roles('CODER', 'TEAM_LEAD', 'MANAGER')
  @ApiOperation({ summary: 'COMPLETED -> REWORK: creates a new current version; the original is preserved' })
  rework(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.production.rework(caller, id);
  }

  @Post(':id/cancel')
  @Roles('TEAM_LEAD', 'MANAGER')
  @ApiOperation({ summary: 'Cancel an un-audited current version (status change, never a delete)' })
  cancel(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.production.cancel(caller, id);
  }
}
