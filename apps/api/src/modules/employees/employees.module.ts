import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LoginNameAllocationModule } from '../login-name-allocations/login-name-allocation.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [AuthModule, LoginNameAllocationModule], // AuthModule for RolesGuard, LoginNameAllocationModule for the detail view's Login Name history
  controllers: [EmployeesController],
  providers: [EmployeesService],
})
export class EmployeesModule {}
