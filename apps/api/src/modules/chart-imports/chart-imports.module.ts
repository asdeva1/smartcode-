import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChartImportsController } from './chart-imports.controller';
import { ChartImportsService } from './chart-imports.service';

@Module({
  imports: [AuthModule], // for RolesGuard
  controllers: [ChartImportsController],
  providers: [ChartImportsService],
})
export class ChartImportsModule {}
