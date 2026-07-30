import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { ReportContentService, ReportPayload } from './report-content.service';
import { ReportMailService } from './report-mail.service';
import { ReportsService } from './reports.service';
import { ReportFrequency } from './reports.schema';

/** How long since the last send before each frequency is due again — interval-based
 *  (days since `lastSentAt`), not calendar-based (no "every Monday"/"1st of the
 *  month" — that would need a day-of-week/day-of-month picker in the UI). */
const INTERVAL_DAYS: Record<Exclude<ReportFrequency, 'OFF'>, number> = {
  WEEKLY: 7,
  MONTHLY: 30,
};

/**
 * Checks once a day for subscriptions due a report and sends them.
 *
 * In-process and single-instance, the same honest limitation
 * `MockPspService`'s timers carry: a restart between the check and the send
 * just means it's picked up on the next day's tick, and running more than one
 * API instance would double-send. A production version would need a durable,
 * distributed-safe scheduler; this is a demo app with one instance.
 */
@Injectable()
export class ReportSchedulerService {
  private readonly logger = new Logger(ReportSchedulerService.name);

  constructor(
    private readonly subscriptions: ReportsService,
    private readonly content: ReportContentService,
    private readonly mail: ReportMailService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendDueReports(): Promise<void> {
    // A cron tick firing mid-test-run would be pure noise at best and a
    // source of flaky assertions at worst — same reasoning as skipping
    // ThrottlerGuard under test in `app.module.ts`.
    if (process.env.NODE_ENV === 'test') return;

    await this.runFor('WEEKLY');
    await this.runFor('MONTHLY');
  }

  /**
   * Sends immediately, ignoring the interval check — backs the dev-only
   * "send a test email now" button. Uses the user's saved frequency, or
   * `WEEKLY` as a preview period if they haven't enabled reports yet; only a
   * genuinely-enabled subscription gets its `lastSentAt` stamped, since an
   * `OFF` preview isn't a real send to account for.
   */
  async sendNow(
    userId: string,
    merchantId: string,
    email: string,
  ): Promise<{ frequency: Exclude<ReportFrequency, 'OFF'>; payload: ReportPayload }> {
    const subscription = await this.subscriptions.getForUser(userId);
    const frequency: Exclude<ReportFrequency, 'OFF'> =
      subscription.frequency === 'OFF' ? 'WEEKLY' : subscription.frequency;

    const payload = await this.content.buildForUser(merchantId, frequency);
    this.mail.sendReport({ email, frequency, payload });

    if (subscription.frequency !== 'OFF') {
      await this.subscriptions.markSentForUser(userId);
    }

    return { frequency, payload };
  }

  private async runFor(frequency: Exclude<ReportFrequency, 'OFF'>): Promise<void> {
    const due = await this.subscriptions.findDueSubscriptions(frequency, INTERVAL_DAYS[frequency]);

    for (const subscription of due) {
      try {
        const payload = await this.content.buildForUser(subscription.user.merchantId, frequency);
        this.mail.sendReport({ email: subscription.user.email, frequency, payload });
        await this.subscriptions.markSent(subscription.id);
      } catch (error) {
        // One user's failure (e.g. a merchant deleted mid-flight) shouldn't
        // stop the rest of the batch from being sent.
        this.logger.error(
          `Failed to send ${frequency.toLowerCase()} report for user ${subscription.userId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
