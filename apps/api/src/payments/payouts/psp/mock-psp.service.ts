import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { webhookEventId } from '../../../common/reference';
import { PayoutEventType } from '../payout-state-machine';
import { payouts } from '../payouts.schema';
import { EVENT_ID_HEADER, SIGNATURE_HEADER, signPayload } from './webhook-signature';

type Payout = typeof payouts.$inferSelect;

export interface PayoutWebhookPayload {
  id: string;
  type: PayoutEventType;
  createdAt: string;
  data: {
    payoutId: string;
    pspReference: string;
    status: string;
    amountMinor: number;
    currency: string;
    failureCode?: string;
    failureReason?: string;
    estimatedArrivalAt?: string;
  };
}

const FAILURE_CODES: Record<string, string> = {
  account_details_invalid: 'The bank rejected the transfer: account details could not be verified.',
  bank_rejected: 'The receiving bank rejected the transfer.',
  account_closed: 'The destination account has been closed.',
  daily_limit_exceeded: 'The transfer exceeded the bank’s daily limit.',
};

/**
 * Stands in for a payment provider's payout rail.
 *
 * The one design decision worth defending: **deliveries go out over real HTTP** to
 * this same API, rather than calling the webhook service directly in-process.
 * An internal call would be simpler, but it would skip everything that actually
 * matters about a webhook — the signature, the raw-body handling, the guard, the
 * JSON round-trip, the fact that the handler runs with no session. Those are
 * precisely the parts most likely to be wrong, so exercising them on every payout
 * in development means a broken signature path fails immediately and visibly
 * rather than only in production.
 *
 * It also means the manual "simulate" controls and the automatic timers travel
 * the identical code path; there is no second, easier route into the state
 * machine that only exists for demos.
 */
@Injectable()
export class MockPspService implements OnModuleDestroy {
  private readonly logger = new Logger(MockPspService.name);

  /**
   * Scheduled deliveries, keyed by payout id, so a manual simulate can cancel the
   * automatic progression rather than racing it — otherwise forcing a payout to
   * fail would be overwritten seconds later by the queued `paid` callback.
   */
  private readonly timers = new Map<string, NodeJS.Timeout[]>();

  constructor(private readonly config: ConfigService) {}

  /**
   * Timers are in-memory, so a restart loses any progression still in flight. In
   * production this would be a durable queue; here the payout simply stays
   * PENDING, which is the correct recoverable state, and the simulate controls can
   * finish it by hand. Flagged rather than hidden — see the README.
   */
  onModuleDestroy(): void {
    for (const [payoutId, timers] of this.timers) {
      timers.forEach(clearTimeout);
      this.logger.debug(`Cancelled scheduled deliveries for payout ${payoutId} on shutdown`);
    }
    this.timers.clear();
  }

  /**
   * Accepts a payout for processing and schedules its lifecycle callbacks.
   *
   * Returns immediately: this models handing a transfer to a provider, and nothing
   * about the request that created the payout should wait on it.
   */
  submitPayout(payout: Payout): void {
    const processingDelay = this.config.get<number>('PSP_PROCESSING_DELAY_MS') ?? 2500;
    const settlementDelay = this.config.get<number>('PSP_SETTLEMENT_DELAY_MS') ?? 8000;

    this.logger.log(
      `Payout ${payout.reference} accepted by mock PSP; processing in ${processingDelay}ms, settling in ${settlementDelay}ms`,
    );

    this.schedule(payout.id, processingDelay, () => this.deliver(payout, 'payout.processing'));
    this.schedule(payout.id, settlementDelay, () => this.deliver(payout, 'payout.paid'));
  }

  /**
   * Emits a lifecycle event now, cancelling anything still scheduled for this
   * payout. Backs the dev-only simulate endpoint.
   */
  async emitNow(payout: Payout, type: PayoutEventType, failureCode?: string): Promise<void> {
    this.cancel(payout.id);
    await this.deliver(payout, type, failureCode);
  }

  cancel(payoutId: string): void {
    this.timers.get(payoutId)?.forEach(clearTimeout);
    this.timers.delete(payoutId);
  }

  private schedule(payoutId: string, delayMs: number, task: () => Promise<void>): void {
    const timer = setTimeout(() => {
      // Remove this timer from the list before running, so a completed delivery
      // isn't left behind to be "cancelled" later.
      const remaining = (this.timers.get(payoutId) ?? []).filter((t) => t !== timer);
      if (remaining.length > 0) {
        this.timers.set(payoutId, remaining);
      } else {
        this.timers.delete(payoutId);
      }

      void task();
    }, delayMs);

    // Don't hold the event loop open on a pending payout; a shutdown shouldn't
    // wait 8 seconds for a mock settlement.
    timer.unref?.();

    this.timers.set(payoutId, [...(this.timers.get(payoutId) ?? []), timer]);
  }

  private buildPayload(payout: Payout, type: PayoutEventType, failureCode?: string): PayoutWebhookPayload {
    const code = failureCode && FAILURE_CODES[failureCode] ? failureCode : 'bank_rejected';

    return {
      id: webhookEventId(),
      type,
      createdAt: new Date().toISOString(),
      data: {
        payoutId: payout.id,
        pspReference: payout.pspReference ?? 'psp_tr_unknown',
        status: type.replace('payout.', ''),
        amountMinor: payout.amountMinor,
        currency: payout.currency,
        ...(type === 'payout.failed' ? { failureCode: code, failureReason: FAILURE_CODES[code] } : {}),
        ...(type === 'payout.processing'
          ? {
              estimatedArrivalAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
            }
          : {}),
      },
    };
  }

  private async deliver(payout: Payout, type: PayoutEventType, failureCode?: string): Promise<void> {
    const payload = this.buildPayload(payout, type, failureCode);
    // Serialise once and sign exactly these bytes — the receiver verifies against
    // the raw body it reads off the wire, so the two must be byte-identical.
    const rawBody = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);

    const url = this.config.getOrThrow<string>('PSP_CALLBACK_URL');
    const signature = signPayload(rawBody, this.config.getOrThrow<string>('PSP_WEBHOOK_SECRET'), timestamp);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SIGNATURE_HEADER]: signature,
          [EVENT_ID_HEADER]: payload.id,
          'user-agent': 'MockPSP/1.0',
        },
        body: rawBody,
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        // A real provider would retry with backoff here. We log loudly instead:
        // adding a retry loop to the mock would obscure the receiver's own bugs,
        // and the receiver is the code under test.
        this.logger.error(
          `Delivery of ${type} for payout ${payout.reference} returned ${response.status}. A real provider would retry.`,
        );
        return;
      }

      this.logger.log(`Delivered ${type} for payout ${payout.reference} (event ${payload.id})`);
    } catch (error) {
      this.logger.error(
        `Failed to deliver ${type} for payout ${payout.reference}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
