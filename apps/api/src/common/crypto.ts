import { createHash, randomBytes } from 'node:crypto';

/**
 * Hashes a server-generated, high-entropy token (a refresh token, an invite
 * token) for storage.
 *
 * A plain SHA-256 is the right primitive here — unlike a password, the input
 * already has 128+ bits of entropy, so there's no dictionary to defend
 * against and no need for a slow KDF. What matters is that a database leak
 * yields hashes that can't be replayed as the original token. Shared by
 * `TokenService` (refresh tokens) and `TeamService` (invitations) so the two
 * can't quietly drift onto different schemes.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A URL-safe, high-entropy token — 256 bits, suitable for an invite link. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}
