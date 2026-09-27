import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

/** page / pageSize / search, identical to the Team Lead & Auditor list DTOs. */
export class PageQueryDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

/** Adds an inclusive YYYY-MM-DD date range. */
export class DatedPageQueryDto extends PageQueryDto {
  @ApiProperty({ required: false, description: 'YYYY-MM-DD' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiProperty({ required: false, description: 'YYYY-MM-DD' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

export const EXPORT_FORMAT_VALUES = ['csv', 'xlsx', 'pdf'] as const;

/** Declares `format` so export endpoints pass forbidNonWhitelisted. */
export function IsExportFormat(): PropertyDecorator {
  return (target, key) => {
    ApiProperty({ enum: EXPORT_FORMAT_VALUES })(target, key);
    IsIn(EXPORT_FORMAT_VALUES, { message: `format must be one of: ${EXPORT_FORMAT_VALUES.join(', ')}` })(target, key as string);
  };
}
