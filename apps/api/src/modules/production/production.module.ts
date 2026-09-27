import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';

@Module({
  imports: [AuthModule], // for RolesGuard
  controllers: [ProductionController],
  providers: [ProductionService],
  exports: [ProductionService],
})
export class ProductionModule {}
