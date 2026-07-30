/**
 * Tables owned by the user module: merchants (the tenant), their logins, and
 * issued refresh tokens. Colocated here rather than in a central schema file
 * so each domain's tables live next to the module that owns them — see
 * `apps/api/src/common/db/schema.ts` for the barrel that re-assembles all of
 * these for Drizzle's single `drizzle(client, { schema })` call.
 */

import { char, index, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { timestamptz } from '../common/db/columns';
import { enumObject } from '../common/db/enum-helpers';

/**
 * OWNER: full access, including managing the team and bank accounts.
 * ACCOUNTANT: everything read-only plus exports and initiating payouts.
 * SUPPORT: read-only everywhere — no exports, no payouts, no team management.
 * Enforced by `RolesGuard` (apps/api/src/common/auth/roles.guard.ts), not by
 * the schema; this enum only names the roles.
 */
export const userRoleEnum = pgEnum('user_role', ['OWNER', 'ACCOUNTANT', 'SUPPORT']);
export const UserRole = enumObject(userRoleEnum.enumValues);
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const merchants = pgTable('merchants', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessName: text('businessName').notNull(),
  legalName: text('legalName'),
  country: char('country', { length: 2 }).notNull(),
  defaultCurrency: char('defaultCurrency', { length: 3 }).notNull(),
  supportEmail: text('supportEmail'),
  createdAt: timestamptz('createdAt').defaultNow().notNull(),
  updatedAt: timestamptz('updatedAt')
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

/** A login. Kept separate from Merchant so a business can invite colleagues
 *  later without reshaping anything; signup creates one Merchant + one OWNER. */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchantId')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    email: text('email').notNull().unique(),
    passwordHash: text('passwordHash').notNull(),
    fullName: text('fullName').notNull(),
    role: userRoleEnum('role').notNull().default('OWNER'),
    lastLoginAt: timestamptz('lastLoginAt'),
    createdAt: timestamptz('createdAt').defaultNow().notNull(),
    updatedAt: timestamptz('updatedAt')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('users_merchantId_idx').on(table.merchantId)],
);

/** One row per issued refresh token, storing only a SHA-256 hash of the token.
 *  `replacedById` links a rotation chain so that presenting an already-rotated
 *  token can be recognised as theft and used to revoke the entire family.
 *  Deliberately not a foreign key — it's just a pointer into the same chain,
 *  and the row it names may already be gone. */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('tokenHash').notNull().unique(),
    familyId: uuid('familyId').notNull(),
    expiresAt: timestamptz('expiresAt').notNull(),
    revokedAt: timestamptz('revokedAt'),
    replacedById: uuid('replacedById'),
    userAgent: text('userAgent'),
    ipAddress: text('ipAddress'),
    createdAt: timestamptz('createdAt').defaultNow().notNull(),
  },
  (table) => [
    index('refresh_tokens_userId_idx').on(table.userId),
    index('refresh_tokens_familyId_idx').on(table.familyId),
  ],
);
