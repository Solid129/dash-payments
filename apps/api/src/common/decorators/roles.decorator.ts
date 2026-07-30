import { SetMetadata } from '@nestjs/common';

import { UserRole } from '../../user/user.schema';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to specific roles. Absence of this decorator means "any
 * authenticated role may call this" — the same default every existing
 * endpoint already had before roles were enforced, so adding this decorator
 * everywhere it doesn't matter was never required.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
