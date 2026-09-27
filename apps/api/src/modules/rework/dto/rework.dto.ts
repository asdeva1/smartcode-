import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MAX_COUNT, REWORK_STATUSES } from '@smartcode/types';
import { PageQueryDto } from '../../../common/dto/list-query.dto';

export class ListReworkDto extends PageQueryDto {
  @ApiProperty({ required: false, enum: [...REWORK_STATUSES, 'pending'], description: "'pending' = OPEN or IN_PROGRESS" })
  @IsOptional()
  @IsIn([...REWORK_STATUSES, 'pending'])
  status?: string;

  @ApiProperty({ required: false, description: 'Narrow to one vendor (AND-ed with the caller scope)' })
  @IsOptional()
  @IsUUID()
  vendorId?: string;
}

/** Mirrors ResolveReworkSchema in @smartcode/types. Coder identity comes from the session. */
export class ResolveReworkDto {
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

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Coded date must be YYYY-MM-DD' })
  codedDate!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;

  @ApiProperty({ description: 'What was corrected' })
  @IsString()
  @MinLength(3, { message: 'Describe what was corrected (at least 3 characters)' })
  @MaxLength(1000)
  resolutionNote!: string;
}
