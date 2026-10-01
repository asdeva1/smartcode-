import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChartAllocationsController } from './chart-allocations.controller';
import { ChartAllocationsService } from './chart-allocations.service';

@Module({
  imports: [AuthModule], // for RolesGuard
  controllers: [ChartAllocationsController],
  providers: [ChartAllocationsService],
})
export class ChartAllocationsModule {}
