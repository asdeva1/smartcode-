import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import { MatchesPassword } from './matches-password.validator';

/**
 * Reuses CreateUserDto for employeeId / fullName / loginName / email /
 * password, so the password policy stays defined in exactly one place.
 * Adds only confirmPassword, which the Auditor form sends and the backend
 * checks independently of the frontend.
 */
export class CreateAuditorDto extends CreateUserDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Confirm password is required' })
  @MatchesPassword()
  confirmPassword!: string;
}
