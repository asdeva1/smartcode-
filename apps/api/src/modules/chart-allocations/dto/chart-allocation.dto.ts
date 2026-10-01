import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/list-query.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const ALLOCATION_FILTER_VALUES = ['all', 'allocated', 'unallocated'] as const;
/** Only CSV/XLSX - the Summary export must be re-importable via the Team Lead upload, so PDF (the generic ExportService's third format) is deliberately not offered here. */
export const ALLOCATION_EXPORT_FORMAT_VALUES = ['csv', 'xlsx'] as const;

/** Manager's allocatable-charts list / export filters. `search` matches ChartID. */
export class ListChartAllocationsDto extends PageQueryDto {
  @ApiProperty({ required: false, enum: ALLOCATION_FILTER_VALUES, default: 'all' })
  @IsOptional()
  @IsIn(ALLOCATION_FILTER_VALUES)
  allocated?: (typeof ALLOCATION_FILTER_VALUES)[number];
}

export class ExportChartAllocationsDto extends ListChartAllocationsDto {
  @ApiProperty({ enum: ALLOCATION_EXPORT_FORMAT_VALUES })
  @IsIn(ALLOCATION_EXPORT_FORMAT_VALUES, { message: `format must be one of: ${ALLOCATION_EXPORT_FORMAT_VALUES.join(', ')}` })
  format!: 'csv' | 'xlsx';
}

export class ReassignChartAllocationDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  loginName!: string;
}

export class PullbackChartAllocationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Allocation-ledger / allocation-import history list - page/pageSize/search only. */
export class ListChartAllocationHistoryDto extends PageQueryDto {}
