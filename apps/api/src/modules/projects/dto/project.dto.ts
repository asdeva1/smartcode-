import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { PROJECT_ALLOCATION_TYPES, type ProjectAllocationType } from '@smartcode/types';

export class CreateClientDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Client name is required' })
  @MaxLength(120)
  name!: string;
}

export class CreateProjectDto {
  @ApiProperty()
  @IsUUID()
  clientId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Project name is required' })
  @MaxLength(120)
  name!: string;

  @ApiProperty({ required: false, nullable: true, description: 'Team whose Coders work this project' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  teamId?: string | null;

  @ApiProperty({ required: false, enum: PROJECT_ALLOCATION_TYPES, description: 'How this project acquires its Charts. Defaults to AUTOMATIC (unchanged pre-Phase-10 behaviour) when omitted.' })
  @IsOptional()
  @IsIn(PROJECT_ALLOCATION_TYPES)
  allocationType?: ProjectAllocationType;
}

export class UpdateProjectDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  teamId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false, enum: PROJECT_ALLOCATION_TYPES })
  @IsOptional()
  @IsIn(PROJECT_ALLOCATION_TYPES)
  allocationType?: ProjectAllocationType;
}

export class AssignProjectTeamDto {
  @ApiProperty()
  @IsUUID()
  teamId!: string;
}

export class CreateAuditorAssignmentDto {
  @ApiProperty()
  @IsUUID()
  auditorId!: string;

  @ApiProperty()
  @IsUUID()
  projectId!: string;
}
