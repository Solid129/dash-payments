import { Module } from '@nestjs/common';

import { BalanceService } from './balance.service';
import { LedgerRepository } from './ledger.repository';

@Module({
  providers: [LedgerRepository, BalanceService],
  exports: [BalanceService],
})
export class LedgerModule {}
