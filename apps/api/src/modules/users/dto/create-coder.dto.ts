import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import { MatchesPassword } from './matches-password.validator';

/**
 * Team Lead creates a Coder. Same shape and password rules as the Team
 * Lead / Auditor create DTOs, plus an optional initial Active/Inactive
 * status. The Coder's team is always the caller's team - never a field.
 */
export class CreateCoderDto extends CreateUserDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Confirm password is required' })
  @MatchesPassword()
  confirmPassword!: string;

  @ApiProperty({ required: false, default: true, description: 'Initial status; defaults to active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
