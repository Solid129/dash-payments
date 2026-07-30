import { Module } from '@nestjs/common';

import { LedgerModule } from '../ledger/ledger.module';
import { UserModule } from '../../user/user.module';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { PspModule } from './psp/psp.module';
import { PayoutsController } from './payouts.controller';
import { PayoutsRepository } from './payouts.repository';
import { PayoutsService } from './payouts.service';

@Module({
  imports: [LedgerModule, PspModule, UserModule, BankAccountsModule],
  controllers: [PayoutsController],
  providers: [PayoutsRepository, PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
