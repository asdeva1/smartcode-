import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CodersController } from './coders.controller';
import { CodersService } from './coders.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule], // for RolesGuard
  controllers: [UsersController, CodersController],
  providers: [UsersService, CodersService],
  exports: [UsersService],
})
export class UsersModule {}
