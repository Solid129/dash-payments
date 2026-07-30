/** Tables owned by the psp module: inbound webhook deliveries. */

import { index, jsonb, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { payouts } from '../payouts.schema';
import { timestamptz } from '../../../common/db/columns';
import { enumObject } from '../../../common/db/enum-helpers';

export const webhookOutcomeEnum = pgEnum('webhook_outcome', [
  'APPLIED',
  'DUPLICATE',
  'IGNORED_ILLEGAL_TRANSITION',
  'UNKNOWN_PAYOUT',
]);
export const WebhookOutcome = enumObject(webhookOutcomeEnum.enumValues);
export type WebhookOutcome = (typeof WebhookOutcome)[keyof typeof WebhookOutcome];

/** Every webhook delivery we accept, recorded before it is applied.
 *
 *  `eventId` is unique, which is what makes webhook handling idempotent: a
 *  provider retry hits the constraint and we skip re-applying the effect. The
 *  row doubles as an audit log of what we were told and what we did about it. */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: text('eventId').notNull().unique(),
    type: text('type').notNull(),
    payoutId: uuid('payoutId').references(() => payouts.id, { onDelete: 'set null' }),

    payload: jsonb('payload').notNull(),

    receivedAt: timestamptz('receivedAt').defaultNow().notNull(),
    processedAt: timestamptz('processedAt'),
    outcome: webhookOutcomeEnum('outcome').notNull().default('APPLIED'),
    notes: text('notes'),
  },
  (table) => [
    index('webhook_events_payoutId_idx').on(table.payoutId),
    index('webhook_events_receivedAt_idx').on(table.receivedAt),
  ],
);
