import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { Db } from '../../common/db/db.types';
import { DbService } from '../../common/db/db.service';
import { ledgerEntries } from './ledger.schema';

type NewLedgerEntry = typeof ledgerEntries.$inferInsert;

/** All direct `ledgerEntries` table access. No business rules here — see `BalanceService`. */
@Injectable()
export class LedgerRepository {
  constructor(private readonly database: DbService) {}

  async sumByState(merchantId: string, currency: string, client: Db = this.database.db) {
    return client
      .select({
        state: ledgerEntries.state,
        sum: sql<number>`coalesce(sum(${ledgerEntries.amountMinor}), 0)::int`,
      })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.merchantId, merchantId), eq(ledgerEntries.currency, currency)))
      .groupBy(ledgerEntries.state);
  }

  async sumAvailable(merchantId: string, currency: string, client: Db): Promise<number> {
    const [result] = await client
      .select({ sum: sql<number>`coalesce(sum(${ledgerEntries.amountMinor}), 0)::int` })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.merchantId, merchantId),
          eq(ledgerEntries.currency, currency),
          eq(ledgerEntries.state, 'AVAILABLE'),
        ),
      );

    return result?.sum ?? 0;
  }

  async insert(data: NewLedgerEntry, client: Db = this.database.db) {
    const [entry] = await client.insert(ledgerEntries).values(data).returning();
    return entry;
  }
}
