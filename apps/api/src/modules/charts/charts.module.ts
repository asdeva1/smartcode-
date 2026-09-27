import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChartsController } from './charts.controller';
import { ChartsService } from './charts.service';

@Module({
  imports: [AuthModule], // for RolesGuard
  controllers: [ChartsController],
  providers: [ChartsService],
})
export class ChartsModule {}
