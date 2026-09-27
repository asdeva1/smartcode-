import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReworkController } from './rework.controller';
import { ReworkService } from './rework.service';

@Module({
  imports: [AuthModule], // for RolesGuard
  controllers: [ReworkController],
  providers: [ReworkService],
  exports: [ReworkService],
})
export class ReworkModule {}
