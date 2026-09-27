import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { REPORT_GROUPINGS, REPORT_PERIODS, type ReportGrouping, type ReportPeriod } from '@smartcode/types';
import { IsExportFormat } from '../../../common/dto/list-query.dto';

export class ReportQueryDto {
  @ApiProperty({ required: false, description: 'YYYY-MM-DD (custom range, or when no period is given)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiProperty({ required: false, description: 'YYYY-MM-DD (custom range, or when no period is given)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @ApiProperty({ required: false, enum: REPORT_PERIODS, description: 'Named period, resolved against `today`' })
  @IsOptional()
  @IsIn(REPORT_PERIODS as unknown as string[])
  period?: ReportPeriod;

  @ApiProperty({ required: false, description: "Caller's local calendar date (YYYY-MM-DD) the period is relative to" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'today must be YYYY-MM-DD' })
  today?: string;

  @ApiProperty({ required: false, enum: REPORT_GROUPINGS, description: 'Group summary reports by period' })
  @IsOptional()
  @IsIn(REPORT_GROUPINGS as unknown as string[])
  groupBy?: ReportGrouping;

  @ApiProperty({ required: false }) @IsOptional() @IsUUID() vendorId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() teamLeadId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() auditorId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() teamId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() projectId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() coderId?: string;
}

export class ExportReportDto extends ReportQueryDto {
  @IsExportFormat()
  format!: 'csv' | 'xlsx' | 'pdf';
}

export class DashboardQueryDto {
  @ApiProperty({ required: false, description: "Caller's local date (YYYY-MM-DD) for the 'today' figures" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'today must be YYYY-MM-DD' })
  today?: string;
}
