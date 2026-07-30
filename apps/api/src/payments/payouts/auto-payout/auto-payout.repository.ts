import { Injectable } from '@nestjs/common';
import { and, eq, isNull, lt, or } from 'drizzle-orm';

import { Db } from '../../../common/db/db.types';
import { DbService } from '../../../common/db/db.service';
import { payoutSchedules } from './auto-payout.schema';

type NewPayoutSchedule = typeof payoutSchedules.$inferInsert;
type PayoutScheduleUpdate = Partial<NewPayoutSchedule>;

@Injectable()
export class AutoPayoutRepository {
  constructor(private readonly database: DbService) {}

  async findByMerchantId(merchantId: string, client: Db = this.database.db) {
    return client.query.payoutSchedules.findFirst({
      where: eq(payoutSchedules.merchantId, merchantId),
      with: { merchant: true, bankAccount: true },
    });
  }

  async upsertForMerchant(merchantId: string, data: PayoutScheduleUpdate, client: Db = this.database.db) {
    const [row] = await client
      .insert(payoutSchedules)
      .values({ merchantId, ...data })
      .onConflictDoUpdate({ target: payoutSchedules.merchantId, set: data })
      .returning();
    return row;
  }

  async findDailyDue(client: Db = this.database.db) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    return client.query.payoutSchedules.findMany({
      where: and(
        eq(payoutSchedules.dailyEnabled, true),
        or(isNull(payoutSchedules.lastTriggeredAt), lt(payoutSchedules.lastTriggeredAt, startOfDay)),
      ),
      with: { merchant: true, bankAccount: true },
    });
  }

  async findThresholdCandidates(client: Db = this.database.db) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    return client.query.payoutSchedules.findMany({
      where: and(
        eq(payoutSchedules.thresholdEnabled, true),
        or(isNull(payoutSchedules.lastTriggeredAt), lt(payoutSchedules.lastTriggeredAt, startOfDay)),
      ),
      with: { merchant: true, bankAccount: true },
    });
  }

  async markTriggered(id: string, triggeredAt: Date, client: Db = this.database.db): Promise<void> {
    await client
      .update(payoutSchedules)
      .set({ lastTriggeredAt: triggeredAt })
      .where(eq(payoutSchedules.id, id));
  }
}
