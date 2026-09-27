import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { VendorsController } from './vendors.controller';
import { VendorCodersController } from './vendor-coders.controller';
import { VendorsService } from './vendors.service';

@Module({
  imports: [AuthModule, UsersModule], // RolesGuard; UsersService.createWithRole/createCoder + CodersService for Vendor Portal
  controllers: [VendorsController, VendorCodersController],
  providers: [VendorsService],
})
export class VendorsModule {}
