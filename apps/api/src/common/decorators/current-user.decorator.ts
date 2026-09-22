import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';

/**
 * Extracts the authenticated user attached to the request by JwtAuthGuard.
 * This is the ONLY way a controller should learn "who is the caller" —
 * identity is never accepted as a client-supplied field. See
 * docs/09-BUSINESS-RULES.md "Identity Rules".
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthUser = request.user;
    return data ? user?.[data] : user;
  },
);
