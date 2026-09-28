import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateBy, type ValidationArguments } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/list-query.dto';

const STATUS_VALUES = ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'] as const;

/** A Vendor/Team Lead's request to reset one of their own-scope Coder's password. */
export class RequestPasswordResetDto {
  @ApiProperty({ required: false, description: 'Optional reason shown to the Manager reviewing this request' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListPasswordResetRequestsDto extends PageQueryDto {
  @ApiProperty({ required: false, enum: [...STATUS_VALUES, 'all'] })
  @IsOptional()
  @IsIn([...STATUS_VALUES, 'all'])
  status?: string;
}

export class RejectPasswordResetDto {
  @ApiProperty({ description: 'Why the request was rejected - recorded on the request and audited' })
  @IsString()
  @MinLength(1, { message: 'A rejection reason is required' })
  @MaxLength(500)
  reason!: string;
}

/** Mirrors ChangePasswordSchema in @smartcode/types - same new-password rule every account uses. */
export class CompletePasswordResetDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Reset token is required' })
  token!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Confirm your new password' })
  @ValidateBy({
    name: 'matchesNewPassword',
    validator: {
      validate: (value: unknown, args?: ValidationArguments) => value === (args?.object as { newPassword?: unknown })?.newPassword,
      defaultMessage: () => 'Passwords do not match',
    },
  })
  confirmNewPassword!: string;
}

export class ValidateResetTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Reset token is required' })
  token!: string;
}
