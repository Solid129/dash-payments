import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import { BankAccountStatus } from '../bank-accounts/bank-accounts.schema';
import { BalanceService } from '../../ledger/balance.service';
import { CreatePayoutDto } from '../dto/create-payout.dto';
import { DEFAULT_PAYOUT_LIMITS } from '../payout-rules';
import { PayoutsService } from '../payouts.service';
import { AutoPayoutRepository } from './auto-payout.repository';

@Injectable()
export class AutoPayoutSchedulerService {
  private readonly logger = new Logger(AutoPayoutSchedulerService.name);

  constructor(
    private readonly schedules: AutoPayoutRepository,
    private readonly payouts: PayoutsService,
    private readonly bankAccounts: BankAccountsService,
    private readonly balances: BalanceService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runDailySweeps(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;

    const due = await this.schedules.findDailyDue();

    for (const schedule of due) {
      try {
        await this.attemptAutoPayout(schedule, 'daily');
      } catch (error) {
        this.logger.error(
          `Failed to run daily sweep for merchant ${schedule.merchantId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  @Cron('*/1 * * * *')
  async runThresholdChecks(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;

    const candidates = await this.schedules.findThresholdCandidates();

    for (const schedule of candidates) {
      try {
        await this.attemptAutoPayout(schedule, 'threshold');
      } catch (error) {
        this.logger.error(
          `Failed to check threshold for merchant ${schedule.merchantId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  async triggerNowForMerchant(merchantId: string): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Manual trigger not available in production.');
    }

    const schedule = await this.schedules.findByMerchantId(merchantId);
    if (!schedule) {
      throw new Error(`No payout schedule found for merchant ${merchantId}.`);
    }

    // Bypass the cooldown and trigger immediately
    await this.attemptAutoPayout(schedule, 'manual', true);
  }

  private async attemptAutoPayout(
    schedule: Awaited<ReturnType<AutoPayoutRepository['findByMerchantId']>>,
    triggerType: 'daily' | 'threshold' | 'manual',
    _bypassCooldown: boolean = false,
  ): Promise<void> {
    if (!schedule || !schedule.merchant) {
      this.logger.warn(`Schedule or merchant missing for schedule ${schedule?.id}`);
      return;
    }

    const merchantId = schedule.merchantId;
    const merchant = schedule.merchant;

    // Resolve the bank account
    let bankAccountId: string | null = null;

    if (schedule.bankAccountId) {
      bankAccountId = schedule.bankAccountId;
    } else {
      // Use the default verified account
      const accounts = await this.bankAccounts.listForMerchant(merchantId);
      const defaultAccount = accounts.find(
        (acc) => acc.isDefault && acc.status === BankAccountStatus.VERIFIED,
      );
      if (!defaultAccount) {
        this.logger.warn(`No verified default bank account found for merchant ${merchantId}.`);
        return;
      }
      bankAccountId = defaultAccount.id;
    }

    if (!bankAccountId) {
      this.logger.warn(`No bank account selected for merchant ${merchantId}.`);
      return;
    }

    // Get the current balance
    const balance = await this.balances.getBalance(merchantId, merchant.defaultCurrency);

    // For threshold-based payouts, check if we meet the threshold
    if (
      triggerType === 'threshold' &&
      schedule.thresholdMinor &&
      balance.availableMinor < schedule.thresholdMinor
    ) {
      this.logger.debug(
        `Balance ${balance.availableMinor} for merchant ${merchantId} is below threshold ${schedule.thresholdMinor}.`,
      );
      return;
    }

    // Calculate the amount to pay out
    const amountMinor = Math.min(balance.availableMinor, DEFAULT_PAYOUT_LIMITS.maximumMinor);

    if (amountMinor < DEFAULT_PAYOUT_LIMITS.minimumMinor) {
      this.logger.debug(`Available balance for merchant ${merchantId} is below minimum payout amount.`);
      return;
    }

    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);
    const idempotencyKey = `auto-${triggerType}-${merchantId}-${dateStr}`;

    const dto: CreatePayoutDto = {
      amountMinor,
      currency: merchant.defaultCurrency,
      bankAccountId,
    };

    await this.payouts.create(merchantId, null, dto, idempotencyKey); // null userId for system-initiated
    await this.schedules.markTriggered(schedule.id, new Date());
    this.logger.log(
      `Triggered ${triggerType} payout for merchant ${merchantId} (${amountMinor / 100} ${dto.currency})`,
    );
  }
}
