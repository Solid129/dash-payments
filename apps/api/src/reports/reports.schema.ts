/** Tables owned by the reports module: each user's report-email preference. */

import { index, pgEnum, pgTable, uuid } from 'drizzle-orm/pg-core';

import { timestamptz } from '../common/db/columns';
import { enumObject } from '../common/db/enum-helpers';
import { users } from '../user/user.schema';

/** `OFF` is the default — reports are opt-in, never sent until a user chooses one. */
export const reportFrequencyEnum = pgEnum('report_frequency', ['OFF', 'WEEKLY', 'MONTHLY']);
export const ReportFrequency = enumObject(reportFrequencyEnum.enumValues);
export type ReportFrequency = (typeof ReportFrequency)[keyof typeof ReportFrequency];

/** One row per user. `lastSentAt` is what the scheduler compares against the
 *  7-/30-day interval to decide whether a send is due — see
 *  `ReportSchedulerService`. */
export const reportSubscriptions = pgTable(
  'report_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('userId')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    frequency: reportFrequencyEnum('frequency').notNull().default('OFF'),
    lastSentAt: timestamptz('lastSentAt'),
    createdAt: timestamptz('createdAt').defaultNow().notNull(),
    updatedAt: timestamptz('updatedAt')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  // The scheduler's "who's due" query filters on frequency first.
  (table) => [index('report_subscriptions_frequency_idx').on(table.frequency)],
);
