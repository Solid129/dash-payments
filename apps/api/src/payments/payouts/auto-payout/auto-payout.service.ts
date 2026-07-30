import { Injectable } from '@nestjs/common';

import { FieldValidationException } from '../../../common/exceptions/field-validation.exception';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import { BankAccountStatus } from '../bank-accounts/bank-accounts.schema';
import { AutoPayoutRepository } from './auto-payout.repository';
import { UpdateAutoPayoutScheduleDto } from './dto/update-auto-payout-schedule.dto';

export interface AutoPayoutScheduleView {
  dailyEnabled: boolean;
  thresholdEnabled: boolean;
  thresholdMinor: number | null;
  bankAccountId: string | null;
  lastTriggeredAt: Date | null;
}

@Injectable()
export class AutoPayoutService {
  constructor(
    private readonly schedules: AutoPayoutRepository,
    private readonly bankAccounts: BankAccountsService,
  ) {}

  async getForMerchant(merchantId: string): Promise<AutoPayoutScheduleView> {
    const row = await this.schedules.findByMerchantId(merchantId);
    return {
      dailyEnabled: row?.dailyEnabled ?? false,
      thresholdEnabled: row?.thresholdEnabled ?? false,
      thresholdMinor: row?.thresholdMinor ?? null,
      bankAccountId: row?.bankAccountId ?? null,
      lastTriggeredAt: row?.lastTriggeredAt ?? null,
    };
  }

  async updateForMerchant(
    merchantId: string,
    dto: UpdateAutoPayoutScheduleDto,
  ): Promise<AutoPayoutScheduleView> {
    // Validate threshold configuration
    if (dto.thresholdEnabled && (!dto.thresholdMinor || dto.thresholdMinor <= 0)) {
      throw new FieldValidationException(
        {
          thresholdMinor:
            'Threshold amount must be a positive integer when threshold-based payouts are enabled.',
        },
        'Invalid threshold configuration.',
      );
    }

    // Validate bank account if provided
    if (dto.bankAccountId) {
      const bankAccount = await this.bankAccounts.findById(dto.bankAccountId);

      if (!bankAccount || bankAccount.merchantId !== merchantId) {
        throw new FieldValidationException(
          { bankAccountId: 'Bank account not found or does not belong to your merchant account.' },
          'Invalid bank account.',
        );
      }

      if (bankAccount.status !== BankAccountStatus.VERIFIED) {
        throw new FieldValidationException(
          { bankAccountId: 'Bank account must be verified before enabling automatic payouts.' },
          'Bank account not verified.',
        );
      }
    }

    const row = await this.schedules.upsertForMerchant(merchantId, {
      dailyEnabled: dto.dailyEnabled,
      thresholdEnabled: dto.thresholdEnabled,
      thresholdMinor: dto.thresholdMinor ?? null,
      bankAccountId: dto.bankAccountId ?? null,
    });

    return {
      dailyEnabled: row.dailyEnabled,
      thresholdEnabled: row.thresholdEnabled,
      thresholdMinor: row.thresholdMinor,
      bankAccountId: row.bankAccountId,
      lastTriggeredAt: row.lastTriggeredAt,
    };
  }
}
