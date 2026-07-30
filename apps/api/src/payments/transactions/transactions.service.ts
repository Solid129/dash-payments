import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gt, gte, ilike, inArray, lt, lte, or, sql, SQL } from 'drizzle-orm';

import { QueryTransactionsDto, TransactionSortField } from './dto/query-transactions.dto';
import {
  customers,
  PaymentMethod,
  transactions,
  TransactionStatus,
  TransactionType,
} from './transactions.schema';
import { TransactionsRepository } from './transactions.repository';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
/** A hard ceiling on a single export, so a pathological filter (or none at
 *  all) can't make one request try to materialize the entire history. */
const EXPORT_ROW_LIMIT = 50_000;

/** Statuses that represent money the merchant actually earned. */
const SETTLED_STATUSES: TransactionStatus[] = [
  TransactionStatus.SUCCEEDED,
  TransactionStatus.REFUNDED,
  TransactionStatus.PARTIALLY_REFUNDED,
];

/**
 * Fixed display order for payment methods. Charts must assign color by this
 * order, never by which method happens to have the most revenue this period —
 * a filter or a slow month re-sorting the bars would repaint every color, and
 * "color follows the entity, never its rank" is the whole point of a
 * categorical palette.
 */
const METHOD_DISPLAY_ORDER: PaymentMethod[] = [
  PaymentMethod.CARD,
  PaymentMethod.UPI,
  PaymentMethod.WALLET,
  PaymentMethod.BANK_TRANSFER,
];

export interface VolumePoint {
  date: string;
  volumeMinor: number;
  count: number;
}

export interface RevenuePoint {
  date: string;
  netMinor: number;
  feesMinor: number;
  refundedMinor: number;
}

export interface MethodBreakdownPoint {
  method: PaymentMethod;
  grossMinor: number;
  netMinor: number;
  count: number;
}

export interface WindowStats {
  volumeMinor: number;
  feesMinor: number;
  count: number;
  averageMinor: number;
  successRate: number;
}

export interface TransactionListItem {
  id: string;
  reference: string;
  type: (typeof transactions.$inferSelect)['type'];
  status: (typeof transactions.$inferSelect)['status'];
  amountMinor: number;
  feeMinor: number;
  netMinor: number;
  currency: string;
  method: (typeof transactions.$inferSelect)['method'];
  cardBrand: string | null;
  last4: string | null;
  description: string | null;
  createdAt: Date;
  settledAt: Date | null;
  customer: { id: string; name: string; email: string } | null;
}

export interface TransactionListResult {
  items: TransactionListItem[];
  /** `null` when this is the last page. */
  nextCursor: string | null;
  /** Totals for everything matching the filters, not just this page. */
  totals: {
    count: number;
    grossMinor: number;
    netMinor: number;
    feeMinor: number;
  };
}

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(private readonly transactions: TransactionsRepository) {}

  /**
   * Every method takes `merchantId` as its first parameter and puts it into the
   * `where` clause unconditionally. It is never read from user input, so no query
   * in this service can reach another tenant's rows.
   */
  async list(merchantId: string, query: QueryTransactionsDto): Promise<TransactionListResult> {
    const where = TransactionsService.buildWhere(merchantId, query);
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortDir = query.sortDir ?? 'desc';

    const cursorCondition = query.cursor
      ? await this.buildCursorCondition(sortBy, sortDir, query.cursor)
      : undefined;

    const sortColumn = sortBy === 'createdAt' ? transactions.createdAt : transactions.amountMinor;
    const dir = sortDir === 'asc' ? asc : desc;
    // `id` is the tiebreaker so the ordering is total. Without it, rows
    // sharing a timestamp could be returned in an unstable order and cursor
    // pagination would skip or repeat them.
    const orderBy = [dir(sortColumn), dir(transactions.id)];

    const [rows, totals] = await Promise.all([
      this.transactions.findManyWithCustomer(
        cursorCondition ? and(where, cursorCondition) : where,
        orderBy,
        // Fetch one extra row to learn whether another page exists, without a
        // second COUNT query.
        limit + 1,
      ),
      // Totals use the filters only — never the cursor condition — so they
      // stay "everything matching the filters", not "everything from here on".
      this.transactions.countAndSum(where),
    ]);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
      totals: {
        count: totals?.count ?? 0,
        grossMinor: totals?.grossMinor ?? 0,
        netMinor: totals?.netMinor ?? 0,
        feeMinor: totals?.feeMinor ?? 0,
      },
    };
  }

  /**
   * Every row matching the filters, for CSV export — no cursor, no page size
   * from the caller. `query.cursor`/`query.limit` are ignored if present;
   * only the filter fields of `QueryTransactionsDto` apply.
   */
  async listForExport(merchantId: string, query: QueryTransactionsDto): Promise<TransactionListItem[]> {
    const where = TransactionsService.buildWhere(merchantId, query);

    const matchCount = await this.transactions.countMatching(where);
    if (matchCount > EXPORT_ROW_LIMIT) {
      this.logger.warn(
        `Export for merchant ${merchantId} matched ${matchCount} rows; truncating to ${EXPORT_ROW_LIMIT}. Narrow the filters for a complete export.`,
      );
    }

    return this.transactions.findExportRows(where, EXPORT_ROW_LIMIT);
  }

  async findOne(merchantId: string, id: string) {
    // `where: and(eq(id), eq(merchantId))`, not a lookup by id followed by a
    // check: the scope is part of the query, so there is no window in which
    // the wrong row is in hand.
    const transaction = await this.transactions.findByIdForMerchant(
      and(eq(transactions.id, id), eq(transactions.merchantId, merchantId)),
    );

    if (!transaction) {
      // 404 rather than 403, deliberately. Distinguishing "doesn't exist" from
      // "exists but isn't yours" would turn this endpoint into an oracle for
      // probing other merchants' transaction ids.
      throw new NotFoundException('Transaction not found.');
    }

    const refundedMinor = transaction.refunds
      .filter((refund) => refund.status === 'SUCCEEDED')
      .reduce((sum, refund) => sum + refund.amountMinor, 0);

    return {
      ...transaction,
      refundedMinor,
      refundableMinor:
        transaction.type === TransactionType.PAYMENT
          ? Math.max(transaction.amountMinor - refundedMinor, 0)
          : 0,
    };
  }

  /**
   * Kept static and pure so the filter logic can be unit tested without a
   * database — the interesting bugs in a query builder are in how the clauses
   * combine, which is exactly what a pure function makes cheap to assert.
   *
   * Returns a Drizzle `SQL` condition rather than a plain object (Prisma's
   * `WhereInput` was a plain, `toEqual`-able object; a Drizzle condition tree
   * built from `and()`/`or()`/`ilike()` is not) — see `transactions.service.spec.ts`
   * for how the tests assert on the generated SQL text instead.
   */
  static buildWhere(merchantId: string, query: QueryTransactionsDto): SQL | undefined {
    const conditions: SQL[] = [eq(transactions.merchantId, merchantId)];

    if (query.status?.length) {
      conditions.push(inArray(transactions.status, query.status));
    }
    if (query.method?.length) {
      conditions.push(inArray(transactions.method, query.method));
    }
    if (query.type) {
      conditions.push(eq(transactions.type, query.type));
    }

    if (query.dateFrom) {
      conditions.push(gte(transactions.createdAt, new Date(query.dateFrom)));
    }
    if (query.dateTo) {
      // `dateTo` is treated as inclusive of the whole day: a user picking
      // "1 March" in a date range means through the end of 1 March, not
      // midnight at its start.
      conditions.push(lte(transactions.createdAt, endOfDay(new Date(query.dateTo))));
    }

    if (query.amountMin !== undefined) {
      conditions.push(gte(transactions.amountMinor, query.amountMin));
    }
    if (query.amountMax !== undefined) {
      conditions.push(lte(transactions.amountMinor, query.amountMax));
    }

    if (query.q) {
      const term = `%${query.q}%`;
      // The nested customer-name/email filter has no direct equivalent in a
      // flat `where` the way Prisma's implicit relation filter did — it's a
      // correlated EXISTS subquery instead. Built with the `sql` tag rather
      // than a query-builder `exists()` helper so this stays a pure function
      // with no `db` handle required (a builder-based subquery needs one).
      const customerMatch = sql`exists (
        select 1 from ${customers}
        where ${eq(customers.id, transactions.customerId)}
          and (${ilike(customers.name, term)} or ${ilike(customers.email, term)})
      )`;

      conditions.push(
        or(ilike(transactions.reference, term), ilike(transactions.description, term), customerMatch)!,
      );
    }

    return and(...conditions);
  }

  /**
   * Replicates Prisma's `cursor: { id }, skip: 1` under a compound
   * `orderBy [{ [sortBy]: sortDir }, { id: sortDir }]` — Prisma resumes from
   * the cursor row's *position in that exact sort order*, not simply "id >
   * cursor". The equivalent here is keyset pagination: look up the cursor
   * row's sort-field value, then take rows whose `(sortValue, id)` tuple comes
   * strictly after it in the requested direction.
   *
   * Returns `undefined` (no additional filtering) if the cursor row is gone —
   * a stale cursor shouldn't 404 the whole page, it should just stop
   * narrowing further.
   */
  private async buildCursorCondition(
    sortBy: TransactionSortField,
    sortDir: 'asc' | 'desc',
    cursorId: string,
  ): Promise<SQL | undefined> {
    const compare = sortDir === 'asc' ? gt : lt;

    if (sortBy === 'createdAt') {
      const cursorRow = await this.transactions.findSortValueByCreatedAt(cursorId);
      if (!cursorRow) return undefined;

      return or(
        compare(transactions.createdAt, cursorRow.sortValue),
        and(eq(transactions.createdAt, cursorRow.sortValue), compare(transactions.id, cursorRow.id)),
      );
    }

    const cursorRow = await this.transactions.findSortValueByAmount(cursorId);
    if (!cursorRow) return undefined;

    return or(
      compare(transactions.amountMinor, cursorRow.sortValue),
      and(eq(transactions.amountMinor, cursorRow.sortValue), compare(transactions.id, cursorRow.id)),
    );
  }

  // --- Dashboard reporting -------------------------------------------------
  // Exposed so `DashboardService` never has to touch the `transactions` table
  // directly — it's cross-domain data from the dashboard's point of view.

  async sumSuccessfulRefunds(merchantId: string, from: Date): Promise<number> {
    return this.transactions.sumSuccessfulRefunds(merchantId, from);
  }

  /**
   * Daily buckets for the volume chart.
   *
   * Grouped in SQL rather than in JS: pulling every row back to bucket it in the
   * application would move hundreds of rows over the wire to produce thirty
   * numbers, and would get worse as history grows.
   */
  async getVolumeSeries(merchantId: string, days = 30): Promise<VolumePoint[]> {
    const from = startOfUtcDay(subtractDays(new Date(), days - 1));
    const rows = await this.transactions.volumeByDay(merchantId, from, SETTLED_STATUSES);

    const byDay = new Map(
      rows.map((row) => [toIsoDate(row.day), { volumeMinor: row.volume, count: row.count }]),
    );

    // Gap-fill server-side. A chart that silently skips zero-volume days
    // compresses the x-axis and makes a quiet week look like a busy one.
    return Array.from({ length: days }, (_, index) => {
      const date = toIsoDate(addDays(from, index));
      const bucket = byDay.get(date);
      return { date, volumeMinor: bucket?.volumeMinor ?? 0, count: bucket?.count ?? 0 };
    });
  }

  /**
   * Daily revenue composition: net revenue, fees, and refunds, gap-filled
   * exactly like `getVolumeSeries`.
   */
  async getRevenueSeries(merchantId: string, days = 30): Promise<RevenuePoint[]> {
    const from = startOfUtcDay(subtractDays(new Date(), days - 1));
    const rows = await this.transactions.revenueByDay(merchantId, from, SETTLED_STATUSES);

    const byDay = new Map(
      rows.map((row) => [
        toIsoDate(row.day),
        { netMinor: row.net, feesMinor: row.fees, refundedMinor: row.refunds },
      ]),
    );

    return Array.from({ length: days }, (_, index) => {
      const date = toIsoDate(addDays(from, index));
      const bucket = byDay.get(date);
      return {
        date,
        netMinor: bucket?.netMinor ?? 0,
        feesMinor: bucket?.feesMinor ?? 0,
        refundedMinor: bucket?.refundedMinor ?? 0,
      };
    });
  }

  /**
   * Gross/net revenue and volume per payment method for the window, always
   * returned in `METHOD_DISPLAY_ORDER` — a method with zero activity still
   * appears, at zero, rather than being silently absent.
   */
  async getRevenueByMethod(merchantId: string, days = 30): Promise<MethodBreakdownPoint[]> {
    const from = subtractDays(new Date(), days);
    const grouped = await this.transactions.sumByMethod(merchantId, from, SETTLED_STATUSES);

    const byMethod = new Map(grouped.map((row) => [row.method, row]));

    return METHOD_DISPLAY_ORDER.map((method) => {
      const row = byMethod.get(method);
      return {
        method,
        grossMinor: row?.grossMinor ?? 0,
        netMinor: row?.netMinor ?? 0,
        count: row?.count ?? 0,
      };
    });
  }

  async getRecentTransactions(merchantId: string, limit = 8) {
    return this.transactions.findRecent(merchantId, limit);
  }

  /** Aggregates for one window: `[from, to)`. */
  async getWindowStats(merchantId: string, from: Date, to: Date): Promise<WindowStats> {
    const { settled, all } = await this.transactions.windowStats(merchantId, from, to, SETTLED_STATUSES);

    return {
      volumeMinor: settled?.sumAmount ?? 0,
      feesMinor: settled?.sumFee ?? 0,
      count: settled?.count ?? 0,
      averageMinor: settled?.avgAmount ?? 0,
      // Success rate is measured against every attempt, including failures —
      // that's the number a merchant cares about.
      successRate: !all || all.count === 0 ? 0 : ((settled?.count ?? 0) / all.count) * 100,
    };
  }
}

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 86_400_000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function startOfUtcDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

/**
 * `date` is a `Date` when it comes from JS-side computation, but a plain
 * string when it comes back from `db.execute()`'s raw SQL path — the
 * postgres-js driver doesn't apply Drizzle's column-level date parsing to an
 * ungrouped `date_trunc(...)` expression the way it does for a real column.
 */
function toIsoDate(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * If the caller passed a bare date (`2026-03-01`), extend to the end of that day.
 * A precise timestamp is respected as given.
 */
function endOfDay(date: Date): Date {
  const isMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;

  if (!isMidnight) return date;

  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}
