import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { UserRole } from '../../user/user.schema';
import { RolesGuard } from './roles.guard';

function contextWith(user: { role: UserRole } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  function guardWith(metadata: { isPublic?: boolean; roles?: UserRole[] }) {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === 'isPublic') return metadata.isPublic;
        if (key === 'roles') return metadata.roles;
        return undefined;
      }),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  it('allows a route with no @Roles() metadata for any authenticated role', () => {
    const guard = guardWith({});
    expect(guard.canActivate(contextWith({ role: UserRole.SUPPORT }))).toBe(true);
  });

  it('allows a public route through even with no user attached', () => {
    const guard = guardWith({ isPublic: true, roles: [UserRole.OWNER] });
    expect(guard.canActivate(contextWith(undefined))).toBe(true);
  });

  it('allows a role that is in the required list', () => {
    const guard = guardWith({ roles: [UserRole.OWNER, UserRole.ACCOUNTANT] });
    expect(guard.canActivate(contextWith({ role: UserRole.ACCOUNTANT }))).toBe(true);
  });

  it('rejects a role that is not in the required list', () => {
    const guard = guardWith({ roles: [UserRole.OWNER, UserRole.ACCOUNTANT] });
    expect(() => guard.canActivate(contextWith({ role: UserRole.SUPPORT }))).toThrow(ForbiddenException);
  });

  it('rejects a missing user on a restricted, non-public route', () => {
    const guard = guardWith({ roles: [UserRole.OWNER] });
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(ForbiddenException);
  });
});
