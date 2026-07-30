import { index, integer, pgTable, uuid, boolean } from 'drizzle-orm/pg-core';

import { merchants } from '../../../user/user.schema';
import { bankAccounts } from '../bank-accounts/bank-accounts.schema';
import { timestamptz } from '../../../common/db/columns';

export const payoutSchedules = pgTable(
  'payout_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchantId')
      .notNull()
      .unique()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    bankAccountId: uuid('bankAccountId').references(() => bankAccounts.id, { onDelete: 'set null' }),
    dailyEnabled: boolean('dailyEnabled').notNull().default(false),
    thresholdEnabled: boolean('thresholdEnabled').notNull().default(false),
    thresholdMinor: integer('thresholdMinor'),
    lastTriggeredAt: timestamptz('lastTriggeredAt'),
    createdAt: timestamptz('createdAt').defaultNow().notNull(),
    updatedAt: timestamptz('updatedAt')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('payout_schedules_dailyEnabled_idx').on(table.dailyEnabled),
    index('payout_schedules_thresholdEnabled_idx').on(table.thresholdEnabled),
  ],
);
