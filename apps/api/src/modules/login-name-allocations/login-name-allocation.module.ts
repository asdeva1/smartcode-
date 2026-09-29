import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LoginNameAllocationController } from './login-name-allocation.controller';
import { LoginNameAllocationService } from './login-name-allocation.service';

/**
 * Exported so UsersModule (UsersService.changeLoginName) and
 * EmployeesModule (Employee Directory detail view) can both inject
 * LoginNameAllocationService without importing each other.
 */
@Module({
  imports: [AuthModule], // for RolesGuard
  controllers: [LoginNameAllocationController],
  providers: [LoginNameAllocationService],
  exports: [LoginNameAllocationService],
})
export class LoginNameAllocationModule {}
