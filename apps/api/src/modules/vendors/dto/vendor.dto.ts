import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { VENDOR_CODE_PATTERN } from '@smartcode/types';
import { CreateAuditorDto } from '../../users/dto/create-auditor.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Mirrors CreateVendorSchema in @smartcode/types. */
export class CreateVendorDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Vendor name must be at least 2 characters' })
  @MaxLength(120, { message: 'Vendor name must be at most 120 characters' })
  name!: string;

  @ApiProperty({ description: '2-20 letters, numbers, "-" or "_"; stored upper-case; not editable later' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(VENDOR_CODE_PATTERN, { message: 'Code: 2-20 letters, numbers, "-" or "_"' })
  code!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_o, v) => v !== '')
  @IsEmail({}, { message: 'Enter a valid email address' })
  contactEmail?: string;
}

/** Vendor code is permanent - deliberately absent here (forbidNonWhitelisted rejects it). */
export class UpdateVendorDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Vendor name must be at least 2 characters' })
  @MaxLength(120)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_o, v) => v !== '')
  @IsEmail({}, { message: 'Enter a valid email address' })
  contactEmail?: string;
}

export class ListVendorsDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25;

  @ApiProperty({ required: false, description: 'Matches name, code or contact' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiProperty({ required: false, enum: ['all', 'active', 'inactive'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'active', 'inactive'])
  status: 'all' | 'active' | 'inactive' = 'all';
}

export class AssignVendorUserDto {
  @ApiProperty()
  @IsUUID(undefined, { message: 'Select a user' })
  userId!: string;
}

export class AssignableQueryDto {
  @ApiProperty({ enum: ['TEAM_LEAD', 'AUDITOR'] })
  @IsIn(['TEAM_LEAD', 'AUDITOR'])
  role!: 'TEAM_LEAD' | 'AUDITOR';
}

export class VendorActivityQueryDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25;
}

export class VendorDashboardQueryDto {
  @ApiProperty({ required: false, description: "Caller's local date (YYYY-MM-DD)" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'today must be YYYY-MM-DD' })
  today?: string;
}

/** Same fields and password rule as every other account (CreateUserDto + confirmPassword). */
export class CreateVendorAccountDto extends CreateAuditorDto {}
