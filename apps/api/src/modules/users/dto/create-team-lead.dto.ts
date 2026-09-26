import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

/**
 * Team assignment is specific to Team Lead creation - coders auto-inherit
 * their creating TL's team (see UsersService.createWithRole), and
 * auditors are scoped via AuditorProjectAssignment, not Team - so this
 * field doesn't belong on the shared CreateUserDto used by all three
 * creation endpoints.
 */
export class CreateTeamLeadDto extends CreateUserDto {
  @ApiProperty({ required: false, description: 'Existing Team to assign this Team Lead to lead' })
  @IsOptional()
  @IsUUID()
  teamId?: string;
}
