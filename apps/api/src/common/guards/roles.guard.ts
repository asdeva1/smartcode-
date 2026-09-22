import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role, AuthUser } from '@smartcode/types';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Applied per-controller/method via @Roles(...). Runs after JwtAuthGuard,
 * which has already attached request.user. See docs/03-RBAC-PERMISSIONS.md.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = request.user;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Role '${user?.role ?? 'unknown'}' is not permitted to perform this action`,
      );
    }
    return true;
  }
}
