import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import type { UserRole } from '../../user/user.schema';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Registered globally, immediately after `JwtAuthGuard`, so `request.user` is
 * already populated (or the route is `@Public()`) by the time this runs.
 *
 * The default is permissive: a route with no `@Roles()` metadata is allowed
 * for any authenticated role, which is exactly the behavior every endpoint had
 * before roles existed. `@Roles()` is the opt-in restriction, not the other
 * way round — the same shape as `@Public()` on `JwtAuthGuard`, and for the
 * same reason: the failure mode of forgetting to annotate a new endpoint
 * should be "too open to your own team", never "500 because `request.user` is
 * missing on a route nobody meant to lock down".
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.role as UserRole)) {
      throw new ForbiddenException('You do not have permission to perform this action.');
    }

    return true;
  }
}
