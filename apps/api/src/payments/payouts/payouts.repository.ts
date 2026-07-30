import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';

import { Db } from '../../common/db/db.types';
import { DbService } from '../../common/db/db.service';
import { IN_FLIGHT_PAYOUT_STATUSES } from './payout-state-machine';
import { payouts, PayoutStatus } from './payouts.schema';

type NewPayout = typeof payouts.$inferInsert;

const BANK_ACCOUNT_SUMMARY_COLUMNS = { id: true, label: true, bankName: true, last4: true } as const;

/** All direct `payouts` table access. No business rules here — see `PayoutsService`. */
@Injectable()
export class PayoutsRepository {
  constructor(private readonly database: DbService) {}

  private scope(merchantId: string, status?: PayoutStatus) {
    return status
      ? and(eq(payouts.merchantId, merchantId), eq(payouts.status, status))
      : eq(payouts.merchantId, merchantId);
  }

  async findManyWithBankAccount(merchantId: string, status?: PayoutStatus, client: Db = this.database.db) {
    return client.query.payouts.findMany({
      where: this.scope(merchantId, status),
      orderBy: [desc(payouts.createdAt), desc(payouts.id)],
      with: { bankAccount: { columns: BANK_ACCOUNT_SUMMARY_COLUMNS } },
    });
  }

  async countMatching(merchantId: string, status: PayoutStatus | undefined, client: Db = this.database.db) {
    const [row] = await client
      .select({ count: sql<number>`count(*)::int` })
      .from(payouts)
      .where(this.scope(merchantId, status));
    return row?.count ?? 0;
  }

  async findExportRows(
    merchantId: string,
    status: PayoutStatus | undefined,
    limit: number,
    client: Db = this.database.db,
  ) {
    return client.query.payouts.findMany({
      where: this.scope(merchantId, status),
      orderBy: [desc(payouts.createdAt), desc(payouts.id)],
      limit,
      with: {
        bankAccount: { columns: { bankName: true, last4: true } },
        initiatedBy: { columns: { fullName: true } },
      },
    });
  }

  async findById(merchantId: string, id: string, client: Db = this.database.db) {
    return client.query.payouts.findFirst({
      where: and(eq(payouts.id, id), eq(payouts.merchantId, merchantId)),
      with: {
        bankAccount: { columns: BANK_ACCOUNT_SUMMARY_COLUMNS },
        webhookEvents: { orderBy: (event, { asc }) => asc(event.receivedAt) },
      },
    });
  }

  async findByIdempotencyKey(merchantId: string, idempotencyKey: string, client: Db = this.database.db) {
    return client.query.payouts.findFirst({
      where: and(eq(payouts.merchantId, merchantId), eq(payouts.idempotencyKey, idempotencyKey)),
    });
  }

  async insert(data: NewPayout, client: Db): Promise<typeof payouts.$inferSelect> {
    const [payout] = await client.insert(payouts).values(data).returning();
    return payout;
  }

  async countInFlight(merchantId: string, client: Db = this.database.db): Promise<number> {
    const [row] = await client
      .select({ count: sql<number>`count(*)::int` })
      .from(payouts)
      .where(and(eq(payouts.merchantId, merchantId), inArray(payouts.status, IN_FLIGHT_PAYOUT_STATUSES)));
    return row?.count ?? 0;
  }

  async sumToday(merchantId: string, startOfDay: Date, client: Db = this.database.db): Promise<number> {
    const [row] = await client
      .select({ sum: sql<number>`coalesce(sum(${payouts.amountMinor}), 0)::int` })
      .from(payouts)
      .where(
        and(
          eq(payouts.merchantId, merchantId),
          gte(payouts.createdAt, startOfDay),
          ne(payouts.status, PayoutStatus.FAILED),
        ),
      );
    return row?.sum ?? 0;
  }

  async sumByMonth(merchantId: string, from: Date, client: Db = this.database.db) {
    return client.execute<{
      month: string;
      paid: number;
      pending: number;
      failed: number;
      count: number;
    }>(sql`
      SELECT
        date_trunc('month', "createdAt") AS month,
        COALESCE(SUM("amountMinor") FILTER (WHERE "status" = 'PAID'), 0)::int AS paid,
        COALESCE(SUM("amountMinor") FILTER (WHERE "status" IN ('PENDING','PROCESSING')), 0)::int AS pending,
        COALESCE(SUM("amountMinor") FILTER (WHERE "status" = 'FAILED'), 0)::int AS failed,
        COUNT(*)::int AS count
      FROM payouts
      WHERE "merchantId" = ${merchantId}::uuid
        AND "createdAt" >= ${from.toISOString()}::timestamptz
      GROUP BY month
      ORDER BY month ASC
    `);
  }

  async findByIdForSimulate(merchantId: string, id: string, client: Db = this.database.db) {
    return client.query.payouts.findFirst({
      where: and(eq(payouts.id, id), eq(payouts.merchantId, merchantId)),
    });
  }
}
