import { Module } from '@nestjs/common';

import { LedgerModule } from '../../ledger/ledger.module';
import { MockPspService } from './mock-psp.service';
import { PayoutWebhooksController } from './payout-webhooks.controller';
import { PayoutWebhooksService } from './payout-webhooks.service';
import { PspRepository } from './psp.repository';
import { PspSignatureGuard } from './psp-signature.guard';

@Module({
  imports: [LedgerModule],
  controllers: [PayoutWebhooksController],
  providers: [PspRepository, MockPspService, PayoutWebhooksService, PspSignatureGuard],
  exports: [MockPspService],
})
export class PspModule {}
