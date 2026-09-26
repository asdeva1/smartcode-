import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import { MatchesPassword } from './matches-password.validator';

/**
 * Team assignment is specific to Team Lead creation - coders auto-inherit
 * their creating TL's team (see UsersService.createWithRole), and
 * auditors are scoped via AuditorProjectAssignment, not Team - so this
 * field doesn't belong on the shared CreateUserDto used by all three
 * creation endpoints.
 */
export class CreateTeamLeadDto extends CreateUserDto {
  /**
   * Sent by the Create Team Lead form. Validated here (required, must
   * equal password) and stripped in UsersService.createTeamLead - never
   * persisted.
   */
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Confirm password is required' })
  @MatchesPassword()
  confirmPassword!: string;

  @ApiProperty({ required: false, description: 'Existing Team to assign this Team Lead to lead' })
  @IsOptional()
  @IsUUID()
  teamId?: string;
}
