import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@smartcode/types';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EmployeesService } from './employees.service';
import { ListEmployeesDto } from './dto/list-employees.dto';

/** Manager-only Employee Directory (docs/09-BUSINESS-RULES.md section 11 / Phase 9). */
@ApiTags('employees')
@Controller('manager/employees')
@UseGuards(RolesGuard)
@Roles('MANAGER')
@ApiBearerAuth()
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @ApiOperation({ summary: 'Manager searches/lists every account in SmartCode, paginated' })
  list(@CurrentUser() caller: AuthUser, @Query() query: ListEmployeesDto) {
    return this.employees.list(caller, query);
  }

  @Get(':id')
  @ApiOperation({ summary: "Manager views one employee's full detail, including their Login Name history" })
  get(@CurrentUser() caller: AuthUser, @Param('id') id: string) {
    return this.employees.get(caller, id);
  }
}
