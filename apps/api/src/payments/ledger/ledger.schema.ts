/** Tables owned by the ledger module: the single source of truth for balances. */

import { char, index, integer, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { merchants } from '../../user/user.schema';
import { timestamptz } from '../../common/db/columns';
import { enumObject } from '../../common/db/enum-helpers';
import { payouts } from '../payouts/payouts.schema';
import { transactions } from '../transactions/transactions.schema';

export const ledgerEntryKindEnum = pgEnum('ledger_entry_kind', [
  'PAYMENT_NET',
  'REFUND',
  'FEE_ADJUSTMENT',
  'PAYOUT',
  'PAYOUT_REVERSAL',
]);
export const LedgerEntryKind = enumObject(ledgerEntryKindEnum.enumValues);
export type LedgerEntryKind = (typeof LedgerEntryKind)[keyof typeof LedgerEntryKind];

export const ledgerEntryStateEnum = pgEnum('ledger_entry_state', ['PENDING', 'AVAILABLE']);
export const LedgerEntryState = enumObject(ledgerEntryStateEnum.enumValues);
export type LedgerEntryState = (typeof LedgerEntryState)[keyof typeof LedgerEntryState];

/** The single source of truth for balances, append-only and signed.
 *
 *    available = SUM(amountMinor) WHERE state = AVAILABLE
 *    pending   = SUM(amountMinor) WHERE state = PENDING
 *
 *  Nothing is ever updated or deleted here: a failed payout is corrected by
 *  appending a compensating PAYOUT_REVERSAL, not by removing the debit. That is
 *  what lets the payout validator trust the number it reads, and what makes a
 *  balance explainable after the fact. */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchantId')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),

    kind: ledgerEntryKindEnum('kind').notNull(),

    /** Signed: credits are positive, debits (payouts, refunds, fees) negative. */
    amountMinor: integer('amountMinor').notNull(),
    currency: char('currency', { length: 3 }).notNull(),

    /** PENDING funds are earned but not yet settled, and cannot be paid out. */
    state: ledgerEntryStateEnum('state').notNull().default('AVAILABLE'),
    availableAt: timestamptz('availableAt'),

    transactionId: uuid('transactionId').references(() => transactions.id, { onDelete: 'set null' }),
    payoutId: uuid('payoutId').references(() => payouts.id, { onDelete: 'set null' }),
    description: text('description'),

    createdAt: timestamptz('createdAt').defaultNow().notNull(),
  },
  (table) => [
    // Balance queries are always "this merchant, this state".
    index('ledger_entries_merchantId_state_idx').on(table.merchantId, table.state),
    index('ledger_entries_transactionId_idx').on(table.transactionId),
    index('ledger_entries_payoutId_idx').on(table.payoutId),
  ],
);
