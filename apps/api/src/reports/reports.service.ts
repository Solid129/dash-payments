import { Injectable } from '@nestjs/common';

import { ReportsRepository } from './reports.repository';
import { ReportFrequency } from './reports.schema';

export interface ReportSubscriptionView {
  frequency: ReportFrequency;
  lastSentAt: Date | null;
}

export interface DueReportSubscription {
  id: string;
  userId: string;
  user: { id: string; email: string; fullName: string; merchantId: string };
}

/**
 * Business logic for a user's report-email preference. Reports are opt-in —
 * a user with no row yet is equivalent to `OFF`, so callers never have to
 * special-case "no subscription exists".
 */
@Injectable()
export class ReportsService {
  constructor(private readonly reports: ReportsRepository) {}

  async getForUser(userId: string): Promise<ReportSubscriptionView> {
    const row = await this.reports.findByUserId(userId);
    return { frequency: row?.frequency ?? ReportFrequency.OFF, lastSentAt: row?.lastSentAt ?? null };
  }

  async updateForUser(userId: string, frequency: ReportFrequency): Promise<ReportSubscriptionView> {
    const row = await this.reports.upsertForUser(userId, frequency);
    return { frequency: row.frequency, lastSentAt: row.lastSentAt };
  }

  /** Subscriptions of `frequency` not sent in the last `intervalDays` days (or never sent). */
  async findDueSubscriptions(
    frequency: Exclude<ReportFrequency, 'OFF'>,
    intervalDays: number,
  ): Promise<DueReportSubscription[]> {
    const cutoff = new Date(Date.now() - intervalDays * 24 * 60 * 60 * 1000);
    return this.reports.findDue(frequency, cutoff);
  }

  async markSent(subscriptionId: string): Promise<void> {
    await this.reports.markSent(subscriptionId, new Date());
  }

  async markSentForUser(userId: string): Promise<void> {
    await this.reports.markSentByUserId(userId, new Date());
  }
}
