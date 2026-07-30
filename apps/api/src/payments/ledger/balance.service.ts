import { Injectable } from '@nestjs/common';

import { Db } from '../../common/db/db.types';
import { LedgerRepository } from './ledger.repository';
import { ledgerEntries } from './ledger.schema';

type NewLedgerEntry = typeof ledgerEntries.$inferInsert;

export interface MerchantBalance {
  /** Settled funds that can be paid out right now. */
  availableMinor: number;
  /** Earned but not yet settled; cannot be paid out. */
  pendingMinor: number;
  currency: string;
}

/**
 * Reads and appends to the ledger — the only source of truth for balances.
 *
 * There is deliberately no `balance` column anywhere. A stored balance is a cache
 * that must be updated in lockstep with every entry that affects it, and the
 * moment those two writes can diverge — a crash, a missed code path, a manual
 * fix — the number becomes unexplainable. Summing an append-only ledger is
 * always correct by construction, and with an index on
 * `(merchantId, state)` it stays cheap at this scale.
 *
 * If this ever grew past what a live SUM can serve, the answer would be a
 * periodically-materialised snapshot plus the entries since it — not a mutable
 * counter.
 */
@Injectable()
export class BalanceService {
  constructor(private readonly ledger: LedgerRepository) {}

  async getBalance(merchantId: string, currency: string, client?: Db): Promise<MerchantBalance> {
    const grouped = await this.ledger.sumByState(merchantId, currency, client);

    const sumFor = (state: 'AVAILABLE' | 'PENDING') => grouped.find((row) => row.state === state)?.sum ?? 0;

    return {
      availableMinor: sumFor('AVAILABLE'),
      pendingMinor: sumFor('PENDING'),
      currency,
    };
  }

  /**
   * The available balance, read inside a transaction for the purpose of deciding
   * whether a debit is allowed.
   *
   * Correctness here rests on the caller running at Serializable isolation: two
   * concurrent payouts that each read the same balance and each decide they can
   * afford it would otherwise both commit and overdraw the account. Under
   * Serializable, Postgres aborts the second one and the caller's retry sees the
   * first payout's debit.
   */
  async getAvailableForUpdate(merchantId: string, currency: string, client: Db): Promise<number> {
    return this.ledger.sumAvailable(merchantId, currency, client);
  }

  /** Appends one entry to the ledger — the only way any balance ever changes. */
  async recordEntry(entry: NewLedgerEntry, client?: Db) {
    return this.ledger.insert(entry, client);
  }
}
