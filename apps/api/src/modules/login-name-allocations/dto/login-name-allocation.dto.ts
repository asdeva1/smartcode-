import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/list-query.dto';

const STATUS_VALUES = ['ACTIVE', 'DEACTIVATED', 'REALLOCATED'] as const;

/**
 * Manager's Login Name Details search (docs/09-BUSINESS-RULES.md section
 * 10 / Phase 9). `search` (from PageQueryDto) matches Login Name,
 * Employee ID, Employee Name, or Email. Defaults to `status=ACTIVE` - the
 * live directory of who currently holds what Login Name - the same
 * "defaults to the live/pending view, `all` opts out" convention as
 * ApprovalsService.list / PasswordResetService.list.
 */
export class ListLoginNameAllocationsDto extends PageQueryDto {
  @ApiProperty({ required: false, enum: [...STATUS_VALUES, 'all'] })
  @IsOptional()
  @IsIn([...STATUS_VALUES, 'all'])
  status?: string;

  @ApiProperty({ required: false, enum: ['MANAGER', 'TEAM_LEAD', 'CODER', 'AUDITOR', 'VENDOR'] })
  @IsOptional()
  @IsIn(['MANAGER', 'TEAM_LEAD', 'CODER', 'AUDITOR', 'VENDOR'])
  role?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiProperty({ required: false, description: "Filter to a specific Team Lead's own-team allocations" })
  @IsOptional()
  @IsUUID()
  teamLeadId?: string;
}
