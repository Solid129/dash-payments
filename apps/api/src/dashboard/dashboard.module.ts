import { Module } from '@nestjs/common';

import { LedgerModule } from '../payments/ledger/ledger.module';
import { PayoutsModule } from '../payments/payouts/payouts.module';
import { TransactionsModule } from '../payments/transactions/transactions.module';
import { UserModule } from '../user/user.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [LedgerModule, TransactionsModule, PayoutsModule, UserModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
