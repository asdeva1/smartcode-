import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/list-query.dto';

/**
 * Manager's Employee Directory search (docs/09-BUSINESS-RULES.md section
 * 11 / Phase 9). `search` (from PageQueryDto) matches Employee ID, Full
 * Name, Login Name, or Email - all server-side, paginated.
 */
export class ListEmployeesDto extends PageQueryDto {
  @ApiProperty({ required: false, enum: ['MANAGER', 'TEAM_LEAD', 'CODER', 'AUDITOR', 'VENDOR'] })
  @IsOptional()
  @IsIn(['MANAGER', 'TEAM_LEAD', 'CODER', 'AUDITOR', 'VENDOR'])
  role?: string;

  @ApiProperty({ required: false, enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiProperty({ required: false, description: "Filter to a specific Team Lead's own-team employees" })
  @IsOptional()
  @IsUUID()
  teamLeadId?: string;
}
