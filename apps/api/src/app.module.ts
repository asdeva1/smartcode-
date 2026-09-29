import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TeamsModule } from './modules/teams/teams.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ProductionModule } from './modules/production/production.module';
import { ChartsModule } from './modules/charts/charts.module';
import { AuditsModule } from './modules/audits/audits.module';
import { ReportsModule } from './modules/reports/reports.module';
import { HealthModule } from './modules/health/health.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { ReworkModule } from './modules/rework/rework.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { PasswordResetModule } from './modules/password-reset/password-reset.module';
import { LoginNameAllocationModule } from './modules/login-name-allocations/login-name-allocation.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100, // global default; auth endpoints apply a tighter limit locally
      },
    ]),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    TeamsModule,
    ProjectsModule,
    ProductionModule,
    ChartsModule,
    AuditsModule,
    ReportsModule,
    VendorsModule,
    ReworkModule,
    NotificationsModule,
    ApprovalsModule,
    PasswordResetModule,
    LoginNameAllocationModule,
    EmployeesModule,
    HealthModule,
  ],
  providers: [
    // Every route requires a valid JWT unless annotated @Public() —
    // see common/decorators/public.decorator.ts and docs/07-SECURITY-ARCHITECTURE.md.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
