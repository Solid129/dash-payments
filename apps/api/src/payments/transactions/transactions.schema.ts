/** Tables owned by the transactions module: customers, payments/refunds, and
 *  their timeline events. */

import {
  char,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { merchants } from '../../user/user.schema';
import { timestamptz } from '../../common/db/columns';
import { enumObject } from '../../common/db/enum-helpers';

export const transactionTypeEnum = pgEnum('transaction_type', ['PAYMENT', 'REFUND']);
export const TransactionType = enumObject(transactionTypeEnum.enumValues);
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const transactionStatusEnum = pgEnum('transaction_status', [
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
]);
export const TransactionStatus = enumObject(transactionStatusEnum.enumValues);
export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];

export const paymentMethodEnum = pgEnum('payment_method', ['CARD', 'BANK_TRANSFER', 'UPI', 'WALLET']);
export const PaymentMethod = enumObject(paymentMethodEnum.enumValues);
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchantId')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    country: char('country', { length: 2 }),
    createdAt: timestamptz('createdAt').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('customers_merchantId_email_key').on(table.merchantId, table.email),
    index('customers_merchantId_idx').on(table.merchantId),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchantId')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    customerId: uuid('customerId').references(() => customers.id, { onDelete: 'set null' }),

    /** Merchant-facing identifier, e.g. `txn_8fk2p1qd`. Unique per merchant so
     *  two merchants can never be confused by a shared reference. */
    reference: text('reference').notNull(),

    type: transactionTypeEnum('type').notNull().default('PAYMENT'),
    status: transactionStatusEnum('status').notNull(),

    /** Gross charged, the processing fee, and what the merchant actually keeps.
     *  netMinor is stored rather than derived so a historical fee change can
     *  never retroactively rewrite past settlements. */
    amountMinor: integer('amountMinor').notNull(),
    feeMinor: integer('feeMinor').notNull().default(0),
    netMinor: integer('netMinor').notNull(),
    currency: char('currency', { length: 3 }).notNull(),

    method: paymentMethodEnum('method').notNull(),
    cardBrand: text('cardBrand'),
    last4: varchar('last4', { length: 4 }),

    description: text('description'),
    failureCode: text('failureCode'),
    failureReason: text('failureReason'),

    /** Set on a REFUND, pointing at the PAYMENT being refunded. */
    parentTransactionId: uuid('parentTransactionId'),

    metadata: jsonb('metadata').default({}),
    createdAt: timestamptz('createdAt').defaultNow().notNull(),
    settledAt: timestamptz('settledAt'),
  },
  (table) => [
    uniqueIndex('transactions_merchantId_reference_key').on(table.merchantId, table.reference),
    // The dashboard's default view: this merchant's activity, newest first.
    index('transactions_merchantId_createdAt_idx').on(table.merchantId, table.createdAt.desc()),
    index('transactions_merchantId_status_idx').on(table.merchantId, table.status),
    index('transactions_merchantId_method_idx').on(table.merchantId, table.method),
    index('transactions_customerId_idx').on(table.customerId),
    index('transactions_parentTransactionId_idx').on(table.parentTransactionId),
    // Self-referencing FK (refund -> original payment): declared here rather
    // than inline on the column, since `transactions` isn't defined yet at
    // the point the column itself is declared.
    foreignKey({
      columns: [table.parentTransactionId],
      foreignColumns: [table.id],
      name: 'transactions_parentTransactionId_fkey',
    }).onDelete('set null'),
  ],
);

/** Append-only audit trail behind the transaction detail timeline. */
export const transactionEvents = pgTable(
  'transaction_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transactionId')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    message: text('message').notNull(),
    createdAt: timestamptz('createdAt').defaultNow().notNull(),
  },
  (table) => [
    index('transaction_events_transactionId_createdAt_idx').on(table.transactionId, table.createdAt),
  ],
);
