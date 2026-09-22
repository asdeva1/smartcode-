import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalAuthProvider } from './providers/local-auth.provider';
import { AUTH_PROVIDER } from './providers/auth-provider.interface';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RolesGuard,
    // The DI swap point for Keycloak in a future phase: replace this
    // `useClass` with `KeycloakAuthProvider` and nothing outside this
    // module needs to change. See docs/06-BACKEND-ARCHITECTURE.md.
    { provide: AUTH_PROVIDER, useClass: LocalAuthProvider },
  ],
  exports: [AuthService, RolesGuard],
})
export class AuthModule {}
