import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DbService } from '../../../common/db/db.service';
import { Db } from '../../../common/db/db.types';
import { isPostgresErrorCode } from '../../../common/db/postgres-error';
import { BalanceService } from '../../ledger/balance.service';
import { LedgerEntryKind, LedgerEntryState } from '../../ledger/ledger.schema';
import { evaluateTransition, isPayoutEventType, targetStatusFor } from '../payout-state-machine';
import { payouts } from '../payouts.schema';
import { PayoutWebhookDto } from './dto/payout-webhook.dto';
import { PspRepository } from './psp.repository';
import { WebhookOutcome } from './psp.schema';

export interface WebhookHandlingResult {
  outcome: WebhookOutcome;
  message: string;
}

/**
 * Applies inbound PSP webhooks to a payout.
 *
 * Every delivery — first time, retried, out of order, or contradicting a state we
 * already committed to — is answered with success. The only thing that differs is
 * whether it mutates anything, which is recorded on the `WebhookEvent` row for
 * audit rather than surfaced as an error to the caller.
 *
 * `webhookEvents` bookkeeping goes through `PspRepository` (this module's own
 * table). The `payouts` row lock/update below stays inline on the transaction
 * handle rather than going through `PayoutsService` — `PayoutsModule` already
 * imports this module, so importing `PayoutsModule` back here would be
 * circular. Left as a flagged follow-up (see the architecture plan) rather
 * than restructured in this pass.
 */
@Injectable()
export class PayoutWebhooksService {
  private readonly logger = new Logger(PayoutWebhooksService.name);

  constructor(
    private readonly database: DbService,
    private readonly webhookEvents: PspRepository,
    private readonly balances: BalanceService,
  ) {}

  async handle(payload: PayoutWebhookDto): Promise<WebhookHandlingResult> {
    if (!isPayoutEventType(payload.type)) {
      // Validated by the DTO's @IsIn already; this is a type-narrowing guard, not
      // a reachable branch in practice.
      return { outcome: WebhookOutcome.IGNORED_ILLEGAL_TRANSITION, message: 'Unknown event type.' };
    }

    return this.database.db.transaction(async (tx) => {
      // Idempotency gate: insert the event row first, keyed on the provider's
      // event id. A retried delivery collides on the unique constraint and we
      // return before touching the payout at all — the transaction guarantees
      // this check and the payout mutation are atomic, so two concurrent
      // deliveries of the same event cannot both pass it.
      //
      // Run inside a SAVEPOINT (via the nested `tx.transaction()` call): once any
      // statement in a Postgres transaction errors, the whole transaction is
      // aborted and every later statement fails too, even if the JS-level
      // rejection is caught here — a bare `.catch()` on the outer `tx` would
      // silently poison the rest of this handler. A savepoint scopes the
      // rollback to just this insert.
      const inserted = await tx
        .transaction((savepoint) =>
          this.webhookEvents.insertEvent({ eventId: payload.id, type: payload.type, payload }, savepoint),
        )
        .catch((error) => {
          if (isPostgresErrorCode(error, '23505')) {
            return null;
          }
          throw error;
        });

      if (!inserted) {
        this.logger.log(`Duplicate webhook delivery ignored: ${payload.id}`);
        return { outcome: WebhookOutcome.DUPLICATE, message: 'Already processed.' };
      }

      // Lock the payout row for the remainder of the transaction so a second
      // event for the same payout — even one that raced past the eventId check
      // because it has a different id — waits for this one to finish before
      // reading the status it will transition from.
      const [payout] = await tx
        .select({
          id: payouts.id,
          merchantId: payouts.merchantId,
          status: payouts.status,
          amountMinor: payouts.amountMinor,
          currency: payouts.currency,
        })
        .from(payouts)
        .where(eq(payouts.id, payload.data.payoutId))
        .for('update');

      if (!payout) {
        await this.webhookEvents.markProcessed(inserted.id, WebhookOutcome.UNKNOWN_PAYOUT, undefined, tx);
        this.logger.warn(`Webhook ${payload.id} refers to unknown payout ${payload.data.payoutId}`);
        return { outcome: WebhookOutcome.UNKNOWN_PAYOUT, message: 'Unknown payout.' };
      }

      const targetStatus = targetStatusFor(payload.type);
      const verdict = evaluateTransition(payout.status, targetStatus);

      await this.webhookEvents.linkPayout(inserted.id, payout.id, tx);

      if (verdict.kind !== 'apply') {
        const outcome =
          verdict.kind === 'noop' ? WebhookOutcome.DUPLICATE : WebhookOutcome.IGNORED_ILLEGAL_TRANSITION;
        await this.webhookEvents.markProcessed(inserted.id, outcome, verdict.reason, tx);
        this.logger.log(`Webhook ${payload.id} for payout ${payout.id}: ${verdict.reason}`);
        return { outcome, message: verdict.reason };
      }

      await this.applyTransition(tx, payout, payload, targetStatus);
      await this.webhookEvents.markProcessed(inserted.id, WebhookOutcome.APPLIED, undefined, tx);

      return { outcome: WebhookOutcome.APPLIED, message: `Payout moved to ${targetStatus}.` };
    });
  }

  private async applyTransition(
    tx: Db,
    payout: { id: string; merchantId: string; amountMinor: number; currency: string },
    payload: PayoutWebhookDto,
    targetStatus: ReturnType<typeof targetStatusFor>,
  ): Promise<void> {
    const now = new Date();

    if (targetStatus === 'PROCESSING') {
      await tx
        .update(payouts)
        .set({
          status: 'PROCESSING',
          processingAt: now,
          pspReference: payload.data.pspReference,
          estimatedArrivalAt: payload.data.estimatedArrivalAt
            ? new Date(payload.data.estimatedArrivalAt)
            : undefined,
        })
        .where(eq(payouts.id, payout.id));
      return;
    }

    if (targetStatus === 'PAID') {
      // The debit was already posted when the payout was accepted; a successful
      // settlement doesn't touch the ledger again, it just confirms the money
      // that was already committed actually arrived.
      await tx
        .update(payouts)
        .set({ status: 'PAID', paidAt: now, pspReference: payload.data.pspReference })
        .where(eq(payouts.id, payout.id));
      return;
    }

    // FAILED: reverse the reservation. This is the one transition that writes to
    // the ledger, and it does so by *appending* a compensating credit rather than
    // deleting the original debit — the append-only ledger is the whole point,
    // and it's what lets an auditor see both the attempt and its reversal.
    await tx
      .update(payouts)
      .set({
        status: 'FAILED',
        failedAt: now,
        failureCode: payload.data.failureCode,
        failureReason: payload.data.failureReason,
      })
      .where(eq(payouts.id, payout.id));

    await this.balances.recordEntry(
      {
        merchantId: payout.merchantId,
        kind: LedgerEntryKind.PAYOUT_REVERSAL,
        amountMinor: payout.amountMinor,
        currency: payout.currency,
        state: LedgerEntryState.AVAILABLE,
        availableAt: now,
        payoutId: payout.id,
        description: `Reversal of failed payout`,
      },
      tx,
    );
  }
}
