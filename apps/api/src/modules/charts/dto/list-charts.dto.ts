import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { AUDIT_STATUSES, PRODUCTION_STATUSES } from '@smartcode/types';
import { IsExportFormat, PageQueryDto } from '../../../common/dto/list-query.dto';

export class ListChartsDto extends PageQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiProperty({ required: false, enum: PRODUCTION_STATUSES })
  @IsOptional()
  @IsIn(PRODUCTION_STATUSES as unknown as string[])
  productionStatus?: string;

  @ApiProperty({ required: false, enum: [...AUDIT_STATUSES, 'NOT_AUDITED'] })
  @IsOptional()
  @IsIn([...AUDIT_STATUSES, 'NOT_AUDITED'])
  auditState?: string;

  @ApiProperty({ required: false, enum: ['yes'] })
  @IsOptional()
  @IsIn(['yes'])
  rework?: 'yes';

  @ApiProperty({ required: false, description: 'Narrow to one vendor (AND-ed with the caller scope)' })
  @IsOptional()
  @IsUUID()
  vendorId?: string;
}

export class ExportChartsDto extends ListChartsDto {
  @IsExportFormat()
  format!: 'csv' | 'xlsx' | 'pdf';
}
