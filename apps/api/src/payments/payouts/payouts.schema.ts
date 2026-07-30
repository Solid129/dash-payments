/** Tables owned by the payouts module. */

import { char, index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { merchants, users } from '../../user/user.schema';
import { bankAccounts } from './bank-accounts/bank-accounts.schema';
import { timestamptz } from '../../common/db/columns';
import { enumObject } from '../../common/db/enum-helpers';

export const payoutStatusEnum = pgEnum('payout_status', ['PENDING', 'PROCESSING', 'PAID', 'FAILED']);
export const PayoutStatus = enumObject(payoutStatusEnum.enumValues);
export type PayoutStatus = (typeof PayoutStatus)[keyof typeof PayoutStatus];

/** Payouts are asynchronous. A request is accepted (PENDING) and the balance is
 *  reserved immediately; a mock PSP later delivers signed webhooks that move it
 *  PROCESSING -> PAID, or straight to FAILED. Each transition stamps its own
 *  timestamp, which is both an audit trail and a cheap way to render a timeline
 *  without a separate events table. */
export const payouts = pgTable(
  'payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchantId')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    bankAccountId: uuid('bankAccountId')
      .notNull()
      .references(() => bankAccounts.id),
    reference: text('reference').notNull(),
    amountMinor: integer('amountMinor').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    status: payoutStatusEnum('status').notNull().default('PENDING'),

    initiatedByUserId: uuid('initiatedByUserId').references(() => users.id, { onDelete: 'set null' }),

    /** Client-supplied `Idempotency-Key`; a retried submit returns the original
     *  payout instead of paying out twice. */
    idempotencyKey: text('idempotencyKey'),
    /** The provider's own identifier for this transfer. */
    pspReference: text('pspReference'),

    estimatedArrivalAt: timestamptz('estimatedArrivalAt'),
    processingAt: timestamptz('processingAt'),
    paidAt: timestamptz('paidAt'),
    failedAt: timestamptz('failedAt'),

    failureCode: text('failureCode'),
    failureReason: text('failureReason'),

    createdAt: timestamptz('createdAt').defaultNow().notNull(),
    updatedAt: timestamptz('updatedAt')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('payouts_merchantId_reference_key').on(table.merchantId, table.reference),
    uniqueIndex('payouts_merchantId_idempotencyKey_key').on(table.merchantId, table.idempotencyKey),
    index('payouts_merchantId_createdAt_idx').on(table.merchantId, table.createdAt.desc()),
    // Finding in-flight payouts, for the concurrency cap and for UI polling.
    index('payouts_merchantId_status_idx').on(table.merchantId, table.status),
  ],
);
