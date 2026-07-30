import { Injectable } from '@nestjs/common';

import { Db } from '../../../common/db/db.types';
import { BankAccountsRepository } from './bank-accounts.repository';

@Injectable()
export class BankAccountsService {
  constructor(private readonly bankAccounts: BankAccountsRepository) {}

  async listForMerchant(merchantId: string) {
    return this.bankAccounts.listByMerchant(merchantId);
  }

  async findById(id: string) {
    return this.bankAccounts.findById(id);
  }

  /**
   * A placeholder destination so the payout screen has something to show and
   * the "must be verified" rule is immediately visible rather than abstract.
   * Created as part of signup — see `AuthService.signup`.
   */
  async createPlaceholder(
    input: { merchantId: string; businessName: string; currency: string },
    client?: Db,
  ) {
    return this.bankAccounts.insert(
      {
        merchantId: input.merchantId,
        label: 'Settlement account',
        accountHolderName: input.businessName,
        bankName: 'Pending verification',
        last4: '0000',
        routingCode: 'PENDING0000000',
        currency: input.currency,
        status: 'PENDING',
        isDefault: true,
      },
      client,
    );
  }
}
