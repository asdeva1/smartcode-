import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { IsExportFormat } from '../../../common/dto/list-query.dto';

export class ReportQueryDto {
  @ApiProperty({ required: false, description: 'YYYY-MM-DD' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiProperty({ required: false, description: 'YYYY-MM-DD' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to?: string;
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
