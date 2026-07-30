import { Injectable, Logger } from '@nestjs/common';

import { formatMoney } from '../common/money';
import { ReportPayload } from './report-content.service';
import { ReportFrequency } from './reports.schema';

/**
 * Stands in for a transactional email provider, the same way `TeamMailService`
 * and `MockPspService` stand in for theirs: no real email is ever sent, and
 * this is the one place that's true. The full payload is returned to the
 * caller as well (see `ReportsController`'s dev-only "send now" route), so
 * the feature is demoable and testable without a real inbox.
 */
@Injectable()
export class ReportMailService {
  private readonly logger = new Logger(ReportMailService.name);

  sendReport(params: {
    email: string;
    frequency: Exclude<ReportFrequency, 'OFF'>;
    payload: ReportPayload;
  }): void {
    const { businessName, summary, revenueByMethod, currency } = params.payload;
    const topMethod = [...revenueByMethod].sort((a, b) => b.grossMinor - a.grossMinor)[0];

    this.logger.log(
      `[mock email] To: ${params.email} — "Your ${params.frequency.toLowerCase()} Northwind Payments report for ${businessName}" — ` +
        `volume ${formatMoney(summary.volume.value, currency)}, ${summary.transactionCount.value} transactions, ` +
        `available balance ${formatMoney(summary.balance.availableMinor, currency)}` +
        (topMethod ? `, top method ${topMethod.method}` : ''),
    );
  }
}
