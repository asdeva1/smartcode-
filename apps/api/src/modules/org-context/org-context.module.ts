import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrgContextController } from './org-context.controller';
import { OrgContextService } from './org-context.service';

@Module({
  imports: [AuthModule], // for RolesGuard
  controllers: [OrgContextController],
  providers: [OrgContextService],
})
export class OrgContextModule {}
