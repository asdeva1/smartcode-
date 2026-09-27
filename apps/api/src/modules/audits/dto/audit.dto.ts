import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AUDIT_ENTRY_STATUSES, AUDIT_STATUSES, CHART_ID_PATTERN, MAX_COUNT } from '@smartcode/types';
import { DatedPageQueryDto, IsExportFormat, PageQueryDto } from '../../../common/dto/list-query.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Audit fields the Auditor enters. Production data is never part of this body. */
export class ReauditDto {
  @ApiProperty()
  @IsInt({ message: 'Audit errors must be a whole number' })
  @Min(0, { message: 'Audit errors cannot be negative' })
  @Max(MAX_COUNT)
  auditErrors!: number;

  @ApiProperty()
  @IsInt({ message: 'Error exceptions must be a whole number' })
  @Min(0, { message: 'Error exceptions cannot be negative' })
  @Max(MAX_COUNT)
  errorExceptions!: number;

  @ApiProperty({ enum: AUDIT_ENTRY_STATUSES })
  @IsIn(AUDIT_ENTRY_STATUSES as unknown as string[], { message: 'Select a valid status' })
  status!: (typeof AUDIT_ENTRY_STATUSES)[number];

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Audit date must be YYYY-MM-DD' })
  auditDate!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;

  @ApiProperty({ required: false, description: 'Optional echo; rejected if it differs from auditErrors + errorExceptions' })
  @IsOptional()
  @IsInt()
  totalErrors?: number;
}

export class CreateAuditDto extends ReauditDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Chart ID is required' })
  @MaxLength(64)
  @Matches(CHART_ID_PATTERN, { message: 'Chart ID may only contain letters, numbers, ".", "-" and "_"' })
  chartId!: string;
}

export class UpdateAuditDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0, { message: 'Audit errors cannot be negative' })
  @Max(MAX_COUNT)
  auditErrors?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0, { message: 'Error exceptions cannot be negative' })
  @Max(MAX_COUNT)
  errorExceptions?: number;

  @ApiProperty({ required: false, enum: AUDIT_ENTRY_STATUSES })
  @IsOptional()
  @IsIn(AUDIT_ENTRY_STATUSES as unknown as string[])
  status?: (typeof AUDIT_ENTRY_STATUSES)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Audit date must be YYYY-MM-DD' })
  auditDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  totalErrors?: number;
}

export class ResolveAuditDto {
  @ApiProperty({ enum: ['COMPLETED', 'REJECTED'] })
  @IsIn(['COMPLETED', 'REJECTED'], { message: 'Choose COMPLETED or REJECTED' })
  status!: 'COMPLETED' | 'REJECTED';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;
}

export class ListAuditsDto extends DatedPageQueryDto {
  @ApiProperty({ required: false, enum: AUDIT_STATUSES })
  @IsOptional()
  @IsIn(AUDIT_STATUSES as unknown as string[])
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiProperty({ required: false, description: 'Narrow to one vendor (AND-ed with the caller scope)' })
  @IsOptional()
  @IsUUID()
  vendorId?: string;
}

export class ExportAuditsDto extends ListAuditsDto {
  @IsExportFormat()
  format!: 'csv' | 'xlsx' | 'pdf';
}

export class AuditQueueDto extends PageQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiProperty({ required: false, enum: ['all', 'pending', 'in_progress'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'pending', 'in_progress'])
  state: 'all' | 'pending' | 'in_progress' = 'all';
}

export class ExportAuditQueueDto extends AuditQueueDto {
  @IsExportFormat()
  format!: 'csv' | 'xlsx' | 'pdf';
}
