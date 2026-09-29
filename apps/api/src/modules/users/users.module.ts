import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CodersController } from './coders.controller';
import { CodersService } from './coders.service';
import { AuthModule } from '../auth/auth.module';
import { LoginNameAllocationModule } from '../login-name-allocations/login-name-allocation.module';

@Module({
  imports: [AuthModule, LoginNameAllocationModule], // AuthModule for RolesGuard, LoginNameAllocationModule for changeLoginName's allocation history
  controllers: [UsersController, CodersController],
  providers: [UsersService, CodersService],
  exports: [UsersService, CodersService],
})
export class UsersModule {}
