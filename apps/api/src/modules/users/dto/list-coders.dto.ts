import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { IsExportFormat, PageQueryDto } from '../../../common/dto/list-query.dto';

export class ListCodersDto extends PageQueryDto {
  @ApiProperty({ required: false, enum: ['all', 'active', 'inactive'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'active', 'inactive'])
  status: 'all' | 'active' | 'inactive' = 'all';
}

export class ExportCodersDto extends ListCodersDto {
  @IsExportFormat()
  format!: 'csv' | 'xlsx' | 'pdf';
}
