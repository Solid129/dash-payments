import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

import { UserRole } from '../../user/user.schema';

/**
 * The authenticated principal, as attached by the JWT strategy.
 *
 * `merchantId` living here — rather than being read from a route param, query
 * string, or body — is the backbone of tenant isolation in this app. A handler
 * physically cannot act on another merchant's data by accident, because the only
 * merchant id in scope came from a signed token.
 *
 * `role` is a real `UserRole`, not a bare `string` — `RolesGuard` and every
 * `@Roles()` call rely on the enum, so a typo'd role name is a compile error
 * rather than a permission check that silently never matches.
 */
export interface AuthenticatedUser {
  userId: string;
  merchantId: string;
  email: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user as AuthenticatedUser;
    return data ? user?.[data] : user;
  },
);
