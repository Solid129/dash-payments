import type { UserRole } from '@/types/api';

/**
 * UI-level permission checks, used only to decide what to show — never to
 * decide what to allow. The real boundary is `RolesGuard` on the API; hiding a
 * button here just keeps someone from bumping into a 403 they can't act on.
 * If these ever disagree with the backend, the backend wins and the user sees
 * a rejected request, not a security hole.
 */

export function canInitiatePayouts(role: UserRole): boolean {
  return role === 'OWNER' || role === 'ACCOUNTANT';
}

export function canExport(role: UserRole): boolean {
  return role === 'OWNER' || role === 'ACCOUNTANT';
}

export function canManageTeam(role: UserRole): boolean {
  return role === 'OWNER';
}
