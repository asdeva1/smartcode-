import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CHART_ID_PATTERN, MAX_COUNT, PRODUCTION_STATUSES } from '@smartcode/types';
import { DatedPageQueryDto, IsExportFormat } from '../../../common/dto/list-query.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Mirrors CreateProductionSchema in @smartcode/types. There is no coder
 * identity field - coderId comes from the JWT.
 */
export class CreateProductionDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Chart ID is required' })
  @MaxLength(64)
  @Matches(CHART_ID_PATTERN, { message: 'Chart ID may only contain letters, numbers, ".", "-" and "_"' })
  chartId!: string;

  @ApiProperty({ required: false, description: 'Required when the Chart ID is new' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiProperty()
  @IsInt({ message: 'Page count must be a whole number' })
  @Min(1, { message: 'Page count must be at least 1' })
  @Max(MAX_COUNT)
  pageCount!: number;

  @ApiProperty()
  @IsInt({ message: 'Total ICDs must be a whole number' })
  @Min(0, { message: 'Total ICDs cannot be negative' })
  @Max(MAX_COUNT)
  totalICDs!: number;

  @ApiProperty()
  @IsInt({ message: 'Total DOS must be a whole number' })
  @Min(0, { message: 'Total DOS cannot be negative' })
  @Max(MAX_COUNT)
  totalDOS!: number;

  @ApiProperty({ enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED'] })
  @IsIn(['PENDING', 'IN_PROGRESS', 'COMPLETED'], { message: 'Select a valid status' })
  status!: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Coded date must be YYYY-MM-DD' })
  codedDate!: string;
}

export class UpdateProductionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Page count must be at least 1' })
  @Max(MAX_COUNT)
  pageCount?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0, { message: 'Total ICDs cannot be negative' })
  @Max(MAX_COUNT)
  totalICDs?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0, { message: 'Total DOS cannot be negative' })
  @Max(MAX_COUNT)
  totalDOS?: number;

  @ApiProperty({ required: false, enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REWORK'] })
  @IsOptional()
  @IsIn(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REWORK'])
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REWORK';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;

  @ApiProperty({ required: false, description: 'YYYY-MM-DD' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Coded date must be YYYY-MM-DD' })
  codedDate?: string;
}

export class ListProductionDto extends DatedPageQueryDto {
  @ApiProperty({ required: false, enum: PRODUCTION_STATUSES })
  @IsOptional()
  @IsIn(PRODUCTION_STATUSES as unknown as string[])
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiProperty({ required: false, description: 'Team Lead / Manager only' })
  @IsOptional()
  @IsUUID()
  coderId?: string;

  @ApiProperty({ required: false, default: false, description: 'Include superseded versions' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeHistory?: boolean;
}

export class ExportProductionDto extends ListProductionDto {
  @IsExportFormat()
  format!: 'csv' | 'xlsx' | 'pdf';
}
