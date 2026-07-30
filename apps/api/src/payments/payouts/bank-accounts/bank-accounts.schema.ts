/** Tables owned by the bank-accounts module: payout destinations. */

import { boolean, char, index, pgEnum, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';

import { merchants } from '../../../user/user.schema';
import { timestamptz } from '../../../common/db/columns';
import { enumObject } from '../../../common/db/enum-helpers';

export const bankAccountStatusEnum = pgEnum('bank_account_status', ['PENDING', 'VERIFIED', 'DISABLED']);
export const BankAccountStatus = enumObject(bankAccountStatusEnum.enumValues);
export type BankAccountStatus = (typeof BankAccountStatus)[keyof typeof BankAccountStatus];

/** A payout destination. Only full account numbers a real system would never
 *  store are omitted — we keep the last four for display, like a card. */
export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchantId')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    accountHolderName: text('accountHolderName').notNull(),
    bankName: text('bankName').notNull(),
    last4: varchar('last4', { length: 4 }).notNull(),
    routingCode: text('routingCode').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    status: bankAccountStatusEnum('status').notNull().default('PENDING'),
    isDefault: boolean('isDefault').notNull().default(false),
    createdAt: timestamptz('createdAt').defaultNow().notNull(),
    updatedAt: timestamptz('updatedAt')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('bank_accounts_merchantId_idx').on(table.merchantId)],
);
