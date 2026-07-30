import { Injectable } from '@nestjs/common';

import { DashboardService, DashboardSummary } from '../dashboard/dashboard.service';
import { MethodBreakdownPoint } from '../payments/transactions/transactions.service';
import { UserService } from '../user/user.service';
import { ReportFrequency } from './reports.schema';

export interface ReportPayload {
  businessName: string;
  periodDays: number;
  currency: string;
  summary: DashboardSummary;
  revenueByMethod: MethodBreakdownPoint[];
}

/**
 * Builds the consolidated report a user's email describes — reusing exactly
 * the numbers the live dashboard shows, via `DashboardService`, rather than
 * a second, parallel set of queries that could drift from what the UI
 * actually displays.
 */
@Injectable()
export class ReportContentService {
  constructor(
    private readonly users: UserService,
    private readonly dashboard: DashboardService,
  ) {}

  async buildForUser(merchantId: string, frequency: Exclude<ReportFrequency, 'OFF'>): Promise<ReportPayload> {
    const periodDays = frequency === 'MONTHLY' ? 30 : 7;
    const merchant = await this.users.getMerchantById(merchantId);

    const [summary, revenueByMethod] = await Promise.all([
      this.dashboard.summary(merchantId, merchant.defaultCurrency, periodDays),
      this.dashboard.revenueByMethod(merchantId, periodDays),
    ]);

    return {
      businessName: merchant.businessName,
      periodDays,
      currency: merchant.defaultCurrency,
      summary,
      revenueByMethod,
    };
  }
}
