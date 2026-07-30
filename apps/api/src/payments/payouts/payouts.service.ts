import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { FieldValidationException } from '../../common/exceptions/field-validation.exception';
import { payoutReference, pspReference as generatePspReference } from '../../common/reference';
import { DbService } from '../../common/db/db.service';
import { findOrThrow } from '../../common/db/query-helpers';
import { isPostgresErrorCode } from '../../common/db/postgres-error';
import { LedgerEntryKind, LedgerEntryState } from '../ledger/ledger.schema';
import { BalanceService } from '../ledger/balance.service';
import { UserService } from '../../user/user.service';
import { BankAccountsService } from './bank-accounts/bank-accounts.service';
import { MockPspService } from './psp/mock-psp.service';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { SimulatableEvent } from './dto/simulate-payout.dto';
import { DEFAULT_PAYOUT_LIMITS, validatePayout } from './payout-rules';
import { PayoutsRepository } from './payouts.repository';
import { payouts, PayoutStatus } from './payouts.schema';

type PayoutRow = typeof payouts.$inferSelect;

/** Same rationale as the transactions export cap — see TransactionsService. */
const EXPORT_ROW_LIMIT = 50_000;

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly database: DbService,
    private readonly payouts: PayoutsRepository,
    private readonly balances: BalanceService,
    private readonly psp: MockPspService,
    private readonly users: UserService,
    private readonly bankAccounts: BankAccountsService,
  ) {}

  async list(merchantId: string, status?: PayoutStatus) {
    return this.payouts.findManyWithBankAccount(merchantId, status);
  }

  async listForExport(merchantId: string, status?: PayoutStatus) {
    const matchCount = await this.payouts.countMatching(merchantId, status);

    if (matchCount > EXPORT_ROW_LIMIT) {
      this.logger.warn(
        `Payout export for merchant ${merchantId} matched ${matchCount} rows; truncating to ${EXPORT_ROW_LIMIT}.`,
      );
    }

    return this.payouts.findExportRows(merchantId, status, EXPORT_ROW_LIMIT);
  }

  async findOne(merchantId: string, id: string) {
    return findOrThrow(await this.payouts.findById(merchantId, id), 'Payout not found.');
  }

  /**
   * Accepts a payout request: validates it, reserves the balance, and hands it to
   * the mock PSP. Returns as soon as the reservation is committed — the payout is
   * PENDING and will be carried to a terminal state by webhook deliveries, not by
   * this request.
   */
  async create(
    merchantId: string,
    userId: string | null,
    dto: CreatePayoutDto,
    idempotencyKey: string | undefined,
  ): Promise<PayoutRow> {
    if (idempotencyKey) {
      const existing = await this.payouts.findByIdempotencyKey(merchantId, idempotencyKey);
      if (existing) {
        this.logger.log(
          `Idempotency key ${idempotencyKey} matched existing payout ${existing.id}; returning it`,
        );
        return existing;
      }
    }

    const merchant = await this.users.getMerchantById(merchantId);

    // Everything the rules need to decide, gathered up front so `validatePayout`
    // stays a pure function over known facts rather than reaching into the
    // database itself.
    const [bankAccount, todaysTotal, inFlightCount] = await Promise.all([
      this.bankAccounts.findById(dto.bankAccountId),
      this.sumTodaysPayouts(merchantId),
      this.payouts.countInFlight(merchantId),
    ]);

    // The balance read here is advisory — it produces a fast, friendly rejection
    // for the common case. The value that actually gates the debit is re-read
    // inside the Serializable transaction below, which is what makes the check
    // safe under concurrency rather than just usually-right.
    const advisoryBalance = await this.balances.getBalance(merchantId, dto.currency);

    const rejection = validatePayout({
      amountMinor: dto.amountMinor,
      currency: dto.currency,
      merchantCurrency: merchant.defaultCurrency,
      availableMinor: advisoryBalance.availableMinor,
      todaysTotalMinor: todaysTotal,
      inFlightCount,
      bankAccount: bankAccount
        ? {
            id: bankAccount.id,
            ownedByMerchant: bankAccount.merchantId === merchantId,
            status: bankAccount.status,
            currency: bankAccount.currency,
          }
        : null,
      limits: DEFAULT_PAYOUT_LIMITS,
    });

    if (rejection) {
      throw new FieldValidationException({ [rejection.field]: rejection.message }, rejection.message);
    }

    const payout = await this.acceptAndReserve(merchantId, userId, dto, idempotencyKey);

    // Hand off to the mock PSP only after the transaction has committed. Firing
    // it from inside the transaction risks the callback racing the commit — the
    // webhook could arrive and look for a payout that, from its point of view,
    // doesn't exist yet.
    this.psp.submitPayout(payout);

    return payout;
  }

  /**
   * The atomic core of accepting a payout: re-validate the balance and insert the
   * payout plus its debit together.
   *
   * Runs at Serializable isolation because the check-then-act here — "read the
   * available balance, then decide whether this debit fits" — is exactly the
   * shape of race that weaker isolation levels allow two concurrent transactions
   * to both get away with. Under Serializable, Postgres detects the conflict and
   * aborts one transaction, which we retry.
   */
  private async acceptAndReserve(
    merchantId: string,
    userId: string | null,
    dto: CreatePayoutDto,
    idempotencyKey: string | undefined,
  ): Promise<PayoutRow> {
    const attempt = async (): Promise<PayoutRow> =>
      this.database.db.transaction(
        async (tx) => {
          const availableMinor = await this.balances.getAvailableForUpdate(merchantId, dto.currency, tx);

          if (dto.amountMinor > availableMinor) {
            throw new FieldValidationException(
              { amountMinor: `That exceeds your available balance.` },
              'That exceeds your available balance.',
            );
          }

          const payout = await this.payouts.insert(
            {
              merchantId,
              bankAccountId: dto.bankAccountId,
              reference: payoutReference(),
              amountMinor: dto.amountMinor,
              currency: dto.currency,
              status: PayoutStatus.PENDING,
              initiatedByUserId: userId,
              idempotencyKey: idempotencyKey ?? null,
              pspReference: generatePspReference(),
              estimatedArrivalAt: new Date(Date.now() + 2 * 86_400_000),
            },
            tx,
          );

          // The debit is posted the instant the payout is accepted, not when it
          // settles — this is what "reserved" means, and it's why the available
          // balance drops immediately in the UI.
          await this.balances.recordEntry(
            {
              merchantId,
              kind: LedgerEntryKind.PAYOUT,
              amountMinor: -dto.amountMinor,
              currency: dto.currency,
              state: LedgerEntryState.AVAILABLE,
              availableAt: new Date(),
              payoutId: payout.id,
              description: `Payout ${payout.reference}`,
            },
            tx,
          );

          return payout;
        },
        { isolationLevel: 'serializable' },
      );

    try {
      return await attempt();
    } catch (error) {
      if (isPostgresErrorCode(error, '40001')) {
        this.logger.warn('Serialization conflict on payout creation; retrying once');
        return attempt();
      }
      throw error;
    }
  }

  /**
   * Manual state control for demos and tests. Registered by the controller only
   * outside production; guarded here too so a route left mounted by mistake still
   * refuses to do anything.
   */
  async simulate(
    merchantId: string,
    payoutId: string,
    event: SimulatableEvent,
    failureCode?: string,
  ): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Simulation is not available in production.');
    }

    const payout = await this.payouts.findByIdForSimulate(merchantId, payoutId);
    if (!payout) {
      throw new NotFoundException('Payout not found.');
    }
    if (payout.status === PayoutStatus.PAID || payout.status === PayoutStatus.FAILED) {
      throw new BadRequestException('This payout has already reached a final state.');
    }

    await this.psp.emitNow(payout, `payout.${event}`, failureCode);
  }

  async countInFlight(merchantId: string): Promise<number> {
    return this.payouts.countInFlight(merchantId);
  }

  private async sumTodaysPayouts(merchantId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    return this.payouts.sumToday(merchantId, startOfDay);
  }
}
