import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { APPROVAL_STATUSES, APPROVAL_TYPES } from '@smartcode/types';
import { PageQueryDto } from '../../../common/dto/list-query.dto';

/** A Team Lead's request for one of their own-team Coder's new Login Name. */
export class RequestLoginNameChangeDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  loginName!: string;
}

export class ListApprovalsDto extends PageQueryDto {
  @ApiProperty({ required: false, enum: APPROVAL_TYPES })
  @IsOptional()
  @IsIn(APPROVAL_TYPES)
  type?: string;

  @ApiProperty({ required: false, enum: [...APPROVAL_STATUSES, 'all'] })
  @IsOptional()
  @IsIn([...APPROVAL_STATUSES, 'all'])
  status?: string;
}

export class RejectApprovalDto {
  @ApiProperty({ description: 'Why the request was rejected - recorded on the request and audited' })
  @IsString()
  @MinLength(1, { message: 'A rejection reason is required' })
  @MaxLength(500)
  reason!: string;
}
