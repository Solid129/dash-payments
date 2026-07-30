import { PgDialect } from 'drizzle-orm/pg-core/dialect';

import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { PaymentMethod, TransactionStatus, TransactionType } from './transactions.schema';
import { TransactionsService } from './transactions.service';

const MERCHANT_ID = 'merchant-1';
const dialect = new PgDialect();

/**
 * `buildWhere` returns a Drizzle SQL builder object, not a plain comparable
 * value — asserting on its shape directly (as the Prisma-era `toEqual({...})`
 * checks did) isn't meaningful for a builder. Compiling it to the actual SQL
 * text + bound parameters preserves the original test intent (does this filter
 * combination produce the right query) with an assertion mechanism that fits
 * Drizzle.
 */
function compile(where: ReturnType<typeof TransactionsService.buildWhere>) {
  if (!where) return { sql: '', params: [] as unknown[] };
  const { sql, params } = dialect.sqlToQuery(where);
  return { sql, params };
}

describe('TransactionsService.buildWhere', () => {
  it('always scopes to the given merchant, even with no other filters', () => {
    const where = TransactionsService.buildWhere(MERCHANT_ID, new QueryTransactionsDto());
    const { sql, params } = compile(where);
    expect(sql).toBe('"transactions"."merchantId" = $1');
    expect(params).toEqual([MERCHANT_ID]);
  });

  it('never lets a filter override or omit the merchant scope', () => {
    const query: QueryTransactionsDto = { status: [TransactionStatus.FAILED] };
    const where = TransactionsService.buildWhere(MERCHANT_ID, query);
    const { sql, params } = compile(where);
    expect(sql).toContain('"transactions"."merchantId" = $1');
    expect(params[0]).toBe(MERCHANT_ID);
  });

  it('filters by one or more statuses', () => {
    const query: QueryTransactionsDto = { status: [TransactionStatus.SUCCEEDED, TransactionStatus.PENDING] };
    const { sql, params } = compile(TransactionsService.buildWhere(MERCHANT_ID, query));
    expect(sql).toContain('"transactions"."status" in ($2, $3)');
    expect(params.slice(1)).toEqual([TransactionStatus.SUCCEEDED, TransactionStatus.PENDING]);
  });

  it('filters by method', () => {
    const query: QueryTransactionsDto = { method: [PaymentMethod.UPI] };
    const { sql, params } = compile(TransactionsService.buildWhere(MERCHANT_ID, query));
    expect(sql).toContain('"transactions"."method" in ($2)');
    expect(params.slice(1)).toEqual([PaymentMethod.UPI]);
  });

  it('filters by type', () => {
    const query: QueryTransactionsDto = { type: TransactionType.REFUND };
    const { sql, params } = compile(TransactionsService.buildWhere(MERCHANT_ID, query));
    expect(sql).toContain('"transactions"."type" = $2');
    expect(params.slice(1)).toEqual([TransactionType.REFUND]);
  });

  it('treats a bare dateTo as inclusive of the whole day', () => {
    const query: QueryTransactionsDto = { dateTo: '2026-03-01T00:00:00.000Z' };
    const { sql, params } = compile(TransactionsService.buildWhere(MERCHANT_ID, query));
    expect(sql).toContain('"transactions"."createdAt" <= $2');
    expect(new Date(params[1] as string).toISOString()).toBe('2026-03-01T23:59:59.999Z');
  });

  it('respects a precise dateTo timestamp rather than extending it', () => {
    const query: QueryTransactionsDto = { dateTo: '2026-03-01T14:30:00.000Z' };
    const { params } = compile(TransactionsService.buildWhere(MERCHANT_ID, query));
    expect(new Date(params[1] as string).toISOString()).toBe('2026-03-01T14:30:00.000Z');
  });

  it('combines dateFrom and dateTo into one range', () => {
    const query: QueryTransactionsDto = {
      dateFrom: '2026-01-01T00:00:00.000Z',
      dateTo: '2026-01-31T00:00:00.000Z',
    };
    const { sql, params } = compile(TransactionsService.buildWhere(MERCHANT_ID, query));
    expect(sql).toContain('"transactions"."createdAt" >= $2');
    expect(sql).toContain('"transactions"."createdAt" <= $3');
    const [gte, lte] = params.slice(1) as string[];
    expect(new Date(gte).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(new Date(lte).toISOString()).toBe('2026-01-31T23:59:59.999Z');
  });

  it('filters by an amount range', () => {
    const query: QueryTransactionsDto = { amountMin: 1000, amountMax: 5000 };
    const { sql, params } = compile(TransactionsService.buildWhere(MERCHANT_ID, query));
    expect(sql).toContain('"transactions"."amountMinor" >= $2');
    expect(sql).toContain('"transactions"."amountMinor" <= $3');
    expect(params.slice(1)).toEqual([1000, 5000]);
  });

  it('searches reference, description, and customer name/email, case-insensitively', () => {
    const query: QueryTransactionsDto = { q: 'Asha' };
    const { sql, params } = compile(TransactionsService.buildWhere(MERCHANT_ID, query));
    expect(sql).toContain('"transactions"."reference" ilike $2');
    expect(sql).toContain('"transactions"."description" ilike $3');
    expect(sql).toContain('exists (');
    expect(sql).toContain('"customers"."name" ilike');
    expect(sql).toContain('"customers"."email" ilike');
    expect(params.slice(1)).toEqual(['%Asha%', '%Asha%', '%Asha%', '%Asha%']);
  });

  it('combines every filter together', () => {
    const query: QueryTransactionsDto = {
      status: [TransactionStatus.SUCCEEDED],
      method: [PaymentMethod.CARD],
      type: TransactionType.PAYMENT,
      amountMin: 100,
      q: 'coffee',
    };
    const { sql, params } = compile(TransactionsService.buildWhere(MERCHANT_ID, query));
    expect(sql).toContain('"transactions"."merchantId" = $1');
    expect(sql).toContain('"transactions"."status" in ($2)');
    expect(sql).toContain('"transactions"."method" in ($3)');
    expect(sql).toContain('"transactions"."type" = $4');
    expect(sql).toContain('"transactions"."amountMinor" >= $5');
    expect(sql).toContain('exists (');
    expect(params).toEqual([
      MERCHANT_ID,
      TransactionStatus.SUCCEEDED,
      PaymentMethod.CARD,
      TransactionType.PAYMENT,
      100,
      '%coffee%',
      '%coffee%',
      '%coffee%',
      '%coffee%',
    ]);
  });
});
