import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, ValidateBy, type ValidationArguments } from 'class-validator';

/**
 * Mirrors ChangePasswordSchema in @smartcode/types. The new-password rule
 * is the same one every account uses (CreateUserDto.password: min 8).
 */
export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Current password is required' })
  currentPassword!: string;

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
