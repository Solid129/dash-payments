import { Module } from '@nestjs/common';

import { LedgerModule } from '../../ledger/ledger.module';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { PayoutsModule } from '../payouts.module';
import { AutoPayoutController } from './auto-payout.controller';
import { AutoPayoutRepository } from './auto-payout.repository';
import { AutoPayoutSchedulerService } from './auto-payout-scheduler.service';
import { AutoPayoutService } from './auto-payout.service';

@Module({
  imports: [PayoutsModule, LedgerModule, BankAccountsModule],
  controllers: [AutoPayoutController],
  providers: [AutoPayoutRepository, AutoPayoutService, AutoPayoutSchedulerService],
})
export class AutoPayoutModule {}
