import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  imports: [AuthModule, UsersModule], // RolesGuard; UsersService.createWithRole for vendor accounts
  controllers: [VendorsController],
  providers: [VendorsService],
})
export class VendorsModule {}
