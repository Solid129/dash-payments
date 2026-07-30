import { Injectable } from '@nestjs/common';

import { BalanceService } from '../payments/ledger/balance.service';
import { PayoutsService } from '../payments/payouts/payouts.service';
import {
  MethodBreakdownPoint,
  RevenuePoint,
  TransactionsService,
  VolumePoint,
} from '../payments/transactions/transactions.service';

export interface MetricWithDelta {
  value: number;
  /**
   * Percentage change against the immediately preceding window of equal length.
   * `null` when the previous window was zero — "up 100%" from nothing is
   * misleading, and the UI renders a dash instead.
   */
  changePercent: number | null;
}

export interface DashboardSummary {
  currency: string;
  balance: { availableMinor: number; pendingMinor: number };
  periodDays: number;
  volume: MetricWithDelta;
  transactionCount: MetricWithDelta;
  averageValue: MetricWithDelta;
  successRate: MetricWithDelta;
  refundedMinor: number;
  feesMinor: number;
  /** Payouts not yet in a terminal state — drives the UI's polling decision. */
  inFlightPayouts: number;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly balances: BalanceService,
    private readonly transactions: TransactionsService,
    private readonly payouts: PayoutsService,
  ) {}

  async summary(merchantId: string, currency: string, periodDays = 30): Promise<DashboardSummary> {
    const now = new Date();
    const currentFrom = subtractDays(now, periodDays);
    // The comparison window is the same length, immediately before the current
    // one, so "vs. previous period" is a like-for-like statement.
    const previousFrom = subtractDays(currentFrom, periodDays);

    const [balance, current, previous, refundedMinor, inFlightPayouts] = await Promise.all([
      this.balances.getBalance(merchantId, currency),
      this.transactions.getWindowStats(merchantId, currentFrom, now),
      this.transactions.getWindowStats(merchantId, previousFrom, currentFrom),
      this.transactions.sumSuccessfulRefunds(merchantId, currentFrom),
      this.payouts.countInFlight(merchantId),
    ]);

    return {
      currency,
      balance: { availableMinor: balance.availableMinor, pendingMinor: balance.pendingMinor },
      periodDays,
      volume: withDelta(current.volumeMinor, previous.volumeMinor),
      transactionCount: withDelta(current.count, previous.count),
      averageValue: withDelta(current.averageMinor, previous.averageMinor),
      successRate: withDelta(current.successRate, previous.successRate),
      refundedMinor,
      feesMinor: current.feesMinor,
      inFlightPayouts,
    };
  }

  async volumeSeries(merchantId: string, days = 30): Promise<VolumePoint[]> {
    return this.transactions.getVolumeSeries(merchantId, days);
  }

  async revenueSeries(merchantId: string, days = 30): Promise<RevenuePoint[]> {
    return this.transactions.getRevenueSeries(merchantId, days);
  }

  async revenueByMethod(merchantId: string, days = 30): Promise<MethodBreakdownPoint[]> {
    return this.transactions.getRevenueByMethod(merchantId, days);
  }

  async recentTransactions(merchantId: string, limit = 8) {
    return this.transactions.getRecentTransactions(merchantId, limit);
  }
}

function withDelta(current: number, previous: number): MetricWithDelta {
  return {
    value: current,
    changePercent: previous === 0 ? null : ((current - previous) / previous) * 100,
  };
}

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 86_400_000);
}
