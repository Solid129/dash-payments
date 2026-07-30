import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lt, SQL, sql } from 'drizzle-orm';

import { Db } from '../../common/db/db.types';
import { DbService } from '../../common/db/db.service';
import {
  customers,
  transactionEvents,
  transactions,
  TransactionStatus,
  TransactionType,
} from './transactions.schema';

const SELECT_COLUMNS = {
  id: transactions.id,
  reference: transactions.reference,
  type: transactions.type,
  status: transactions.status,
  amountMinor: transactions.amountMinor,
  feeMinor: transactions.feeMinor,
  netMinor: transactions.netMinor,
  currency: transactions.currency,
  method: transactions.method,
  cardBrand: transactions.cardBrand,
  last4: transactions.last4,
  description: transactions.description,
  createdAt: transactions.createdAt,
  settledAt: transactions.settledAt,
  customer: { id: customers.id, name: customers.name, email: customers.email },
};

/** All direct `transactions`/`customers`/`transactionEvents` table access. No business rules here — see `TransactionsService`. */
@Injectable()
export class TransactionsRepository {
  constructor(private readonly database: DbService) {}

  // A plain join, not the relational query API: `where` may embed the
  // customer-search EXISTS subquery from `TransactionsService.buildWhere`, and
  // RQB rewrites raw SQL passed as `where` to qualify every column under the
  // root table's own alias — which silently corrupts a subquery that
  // references a different table. The query builder renders `where`
  // verbatim, so it doesn't have this problem.
  async findManyWithCustomer(
    where: SQL | undefined,
    orderBy: SQL[],
    limit: number,
    client: Db = this.database.db,
  ) {
    return client
      .select(SELECT_COLUMNS)
      .from(transactions)
      .leftJoin(customers, eq(transactions.customerId, customers.id))
      .where(where)
      .orderBy(...orderBy)
      .limit(limit);
  }

  async countAndSum(where: SQL | undefined, client: Db = this.database.db) {
    const [row] = await client
      .select({
        count: sql<number>`count(*)::int`,
        grossMinor: sql<number>`coalesce(sum(${transactions.amountMinor}), 0)::int`,
        netMinor: sql<number>`coalesce(sum(${transactions.netMinor}), 0)::int`,
        feeMinor: sql<number>`coalesce(sum(${transactions.feeMinor}), 0)::int`,
      })
      .from(transactions)
      .where(where);
    return row;
  }

  async countMatching(where: SQL | undefined, client: Db = this.database.db): Promise<number> {
    const [row] = await client
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(where);
    return row?.count ?? 0;
  }

  async findExportRows(where: SQL | undefined, limit: number, client: Db = this.database.db) {
    return client
      .select(SELECT_COLUMNS)
      .from(transactions)
      .leftJoin(customers, eq(transactions.customerId, customers.id))
      .where(where)
      .orderBy(desc(transactions.createdAt), desc(transactions.id))
      .limit(limit);
  }

  async findByIdForMerchant(where: SQL | undefined, client: Db = this.database.db) {
    return client.query.transactions.findFirst({
      where,
      with: {
        customer: { columns: { id: true, name: true, email: true, country: true } },
        events: { orderBy: asc(transactionEvents.createdAt) },
        refunds: {
          orderBy: desc(transactions.createdAt),
          columns: {
            id: true,
            reference: true,
            amountMinor: true,
            currency: true,
            status: true,
            createdAt: true,
          },
        },
        parent: {
          columns: { id: true, reference: true, amountMinor: true, currency: true, createdAt: true },
        },
      },
    });
  }

  async findSortValueByCreatedAt(id: string, client: Db = this.database.db) {
    const [row] = await client
      .select({ sortValue: transactions.createdAt, id: transactions.id })
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);
    return row;
  }

  async findSortValueByAmount(id: string, client: Db = this.database.db) {
    const [row] = await client
      .select({ sortValue: transactions.amountMinor, id: transactions.id })
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);
    return row;
  }

  // --- Dashboard reporting -------------------------------------------------
  // These exist so `DashboardService` never has to touch the `transactions`
  // table directly — it's cross-domain data from the dashboard's point of
  // view, so it goes through this service like everything else.

  async sumSuccessfulRefunds(merchantId: string, from: Date, client: Db = this.database.db): Promise<number> {
    const [row] = await client
      .select({ sum: sql<number>`coalesce(sum(${transactions.amountMinor}), 0)::int` })
      .from(transactions)
      .where(
        and(
          eq(transactions.merchantId, merchantId),
          eq(transactions.type, TransactionType.REFUND),
          eq(transactions.status, TransactionStatus.SUCCEEDED),
          gte(transactions.createdAt, from),
        ),
      );
    return row?.sum ?? 0;
  }

  /**
   * `merchantId` is passed as a bound parameter, not interpolated — the `sql`
   * tag parameterizes every interpolation automatically.
   */
  async volumeByDay(
    merchantId: string,
    from: Date,
    settledStatuses: TransactionStatus[],
    client: Db = this.database.db,
  ) {
    return client.execute<{ day: string; volume: number; count: number }>(sql`
      SELECT
        date_trunc('day', "createdAt") AS day,
        COALESCE(SUM("amountMinor"), 0)::int AS volume,
        COUNT(*)::int AS count
      FROM transactions
      WHERE "merchantId" = ${merchantId}::uuid
        AND "type" = 'PAYMENT'
        AND ${inArray(transactions.status, settledStatuses)}
        AND "createdAt" >= ${from.toISOString()}::timestamptz
      GROUP BY day
      ORDER BY day ASC
    `);
  }

  async revenueByDay(
    merchantId: string,
    from: Date,
    settledStatuses: TransactionStatus[],
    granularity: 'day' | 'week' | 'month' = 'day',
    client: Db = this.database.db,
  ) {
    return client.execute<{ bucket: string; net: number; fees: number; refunds: number }>(sql`
      SELECT
        date_trunc(${granularity}, "createdAt") AS bucket,
        COALESCE(SUM("netMinor") FILTER (
          WHERE "type" = 'PAYMENT' AND ${inArray(transactions.status, settledStatuses)}
        ), 0)::int AS net,
        COALESCE(SUM("feeMinor") FILTER (
          WHERE "type" = 'PAYMENT' AND ${inArray(transactions.status, settledStatuses)}
        ), 0)::int AS fees,
        COALESCE(SUM("amountMinor") FILTER (
          WHERE "type" = 'REFUND' AND "status" = 'SUCCEEDED'
        ), 0)::int AS refunds
      FROM transactions
      WHERE "merchantId" = ${merchantId}::uuid
        AND "createdAt" >= ${from.toISOString()}::timestamptz
      GROUP BY bucket
      ORDER BY bucket ASC
    `);
  }

  async sumByMethod(
    merchantId: string,
    from: Date,
    settledStatuses: TransactionStatus[],
    client: Db = this.database.db,
  ) {
    return client
      .select({
        method: transactions.method,
        grossMinor: sql<number>`coalesce(sum(${transactions.amountMinor}), 0)::int`,
        netMinor: sql<number>`coalesce(sum(${transactions.netMinor}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.merchantId, merchantId),
          eq(transactions.type, TransactionType.PAYMENT),
          inArray(transactions.status, settledStatuses),
          gte(transactions.createdAt, from),
        ),
      )
      .groupBy(transactions.method);
  }

  async sumByStatus(
    merchantId: string,
    from: Date,
    client: Db = this.database.db,
  ) {
    return client
      .select({
        status: transactions.status,
        count: sql<number>`count(*)::int`,
        sumMinor: sql<number>`coalesce(sum(${transactions.amountMinor}), 0)::int`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.merchantId, merchantId),
          eq(transactions.type, TransactionType.PAYMENT),
          gte(transactions.createdAt, from),
        ),
      )
      .groupBy(transactions.status);
  }

  async findRecent(merchantId: string, limit: number, client: Db = this.database.db) {
    return client.query.transactions.findMany({
      where: eq(transactions.merchantId, merchantId),
      orderBy: [desc(transactions.createdAt), desc(transactions.id)],
      limit,
      columns: {
        id: true,
        reference: true,
        type: true,
        status: true,
        amountMinor: true,
        currency: true,
        method: true,
        createdAt: true,
      },
      with: { customer: { columns: { id: true, name: true } } },
    });
  }

  /** Aggregates for one window: `[from, to)`. */
  async windowStats(
    merchantId: string,
    from: Date,
    to: Date,
    settledStatuses: TransactionStatus[],
    client: Db = this.database.db,
  ) {
    const range = and(gte(transactions.createdAt, from), lt(transactions.createdAt, to));

    const [[settled], [all]] = await Promise.all([
      client
        .select({
          count: sql<number>`count(*)::int`,
          sumAmount: sql<number>`coalesce(sum(${transactions.amountMinor}), 0)::int`,
          sumFee: sql<number>`coalesce(sum(${transactions.feeMinor}), 0)::int`,
          avgAmount: sql<number>`coalesce(avg(${transactions.amountMinor}), 0)::int`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.merchantId, merchantId),
            eq(transactions.type, TransactionType.PAYMENT),
            inArray(transactions.status, settledStatuses),
            range,
          ),
        ),
      // Success rate is measured against every attempt, including failures —
      // that's the number a merchant cares about.
      client
        .select({ count: sql<number>`count(*)::int` })
        .from(transactions)
        .where(
          and(eq(transactions.merchantId, merchantId), eq(transactions.type, TransactionType.PAYMENT), range),
        ),
    ]);

    return { settled, all };
  }
}
