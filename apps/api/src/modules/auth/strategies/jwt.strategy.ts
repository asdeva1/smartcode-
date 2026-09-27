import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '@smartcode/types';
import { PrismaService } from '../../../prisma/prisma.service';
import { SESSION_USER_INCLUDE, assertVendorAccountUsable, toSessionUser, tokenMatchesPassword } from '../session-user';

/**
 * Verifies the JWT signature/expiry (passport-jwt's job), then re-checks
 * the user is still active on every request - a deactivated account is
 * rejected immediately even with a still-unexpired token. This lookup is
 * intentionally direct (via Prisma) rather than routed back through
 * AuthProvider.verifyAccessToken, since passport has already verified the
 * signature; re-verifying it a second time would be redundant. It also
 * resolves the caller's vendor scope and rejects tokens issued before a
 * password change or for a deactivated vendor's account. If v2
 * swaps in Keycloak, this strategy is replaced by an OIDC strategy
 * entirely - it is not part of the AuthProvider swap surface.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET')!,
    });
  }

  async validate(payload: { sub: string; role: string; pwd?: number }): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: SESSION_USER_INCLUDE,
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }
    // A token issued before the account's last password change is dead.
    if (!tokenMatchesPassword(payload, user.passwordChangedAt)) {
      throw new UnauthorizedException('Your password was changed - please sign in again');
    }
    assertVendorAccountUsable(user);
    return toSessionUser(user);
  }
}
