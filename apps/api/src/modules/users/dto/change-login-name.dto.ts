import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/**
 * docs/09-BUSINESS-RULES.md section 8 (Login Name Change). Manager-only,
 * direct change - Team Lead's request-based flow for Coders (section 9)
 * goes through the approval engine instead and has its own DTO.
 */
export class ChangeLoginNameDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  loginName!: string;
}
