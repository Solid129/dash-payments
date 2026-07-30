/** Tables owned by the team module: pending invitations to join a merchant. */

import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { merchants, userRoleEnum, users } from '../user.schema';
import { timestamptz } from '../../common/db/columns';

/** A pending offer to join a merchant as a teammate. The token is hashed the
 *  same way a refresh token is (see TokenService) — never stored raw, so a
 *  database leak can't be used to accept invitations. Consumed by
 *  `AuthService.acceptInvite`, which creates the `User` row on success. */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchantId')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: userRoleEnum('role').notNull(),
    tokenHash: text('tokenHash').notNull().unique(),
    invitedByUserId: uuid('invitedByUserId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamptz('expiresAt').notNull(),
    acceptedAt: timestamptz('acceptedAt'),
    revokedAt: timestamptz('revokedAt'),
    createdAt: timestamptz('createdAt').defaultNow().notNull(),
  },
  // Deliberately NOT a unique constraint on (merchantId, email): a revoked or
  // expired invitation must not permanently block re-inviting that address.
  // "Already has a pending invite" is instead checked in TeamService against
  // rows where acceptedAt/revokedAt are null and expiresAt is in the future.
  (table) => [index('invitations_merchantId_email_idx').on(table.merchantId, table.email)],
);
