import { Injectable } from '@nestjs/common';
import { and, eq, isNull, lt, or } from 'drizzle-orm';

import { Db } from '../common/db/db.types';
import { DbService } from '../common/db/db.service';
import { reportFrequencyEnum, reportSubscriptions } from './reports.schema';

type ReportFrequencyValue = (typeof reportFrequencyEnum.enumValues)[number];

/** All direct `report_subscriptions` table access. No business rules here — see `ReportSubscriptionsService`. */
@Injectable()
export class ReportsRepository {
  constructor(private readonly database: DbService) {}

  async findByUserId(userId: string, client: Db = this.database.db) {
    return client.query.reportSubscriptions.findFirst({ where: eq(reportSubscriptions.userId, userId) });
  }

  async upsertForUser(userId: string, frequency: ReportFrequencyValue, client: Db = this.database.db) {
    const [row] = await client
      .insert(reportSubscriptions)
      .values({ userId, frequency })
      .onConflictDoUpdate({ target: reportSubscriptions.userId, set: { frequency } })
      .returning();
    return row;
  }

  /** Subscriptions of `frequency` that have never been sent, or were last sent before `cutoff`. */
  async findDue(frequency: ReportFrequencyValue, cutoff: Date, client: Db = this.database.db) {
    return client.query.reportSubscriptions.findMany({
      where: and(
        eq(reportSubscriptions.frequency, frequency),
        or(isNull(reportSubscriptions.lastSentAt), lt(reportSubscriptions.lastSentAt, cutoff)),
      ),
      with: { user: true },
    });
  }

  async markSent(id: string, sentAt: Date, client: Db = this.database.db): Promise<void> {
    await client
      .update(reportSubscriptions)
      .set({ lastSentAt: sentAt })
      .where(eq(reportSubscriptions.id, id));
  }

  /** Only touches a row if one already exists — an ad hoc "send now" on an `OFF`
   *  subscription (no row yet) has nothing to stamp. */
  async markSentByUserId(userId: string, sentAt: Date, client: Db = this.database.db): Promise<void> {
    await client
      .update(reportSubscriptions)
      .set({ lastSentAt: sentAt })
      .where(eq(reportSubscriptions.userId, userId));
  }
}
