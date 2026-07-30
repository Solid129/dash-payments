import { Controller, Get, Module } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser, CurrentUser } from '../../../common/decorators/current-user.decorator';
import { BankAccountsRepository } from './bank-accounts.repository';
import { BankAccountsService } from './bank-accounts.service';

/**
 * Read-only for now. Adding a payout destination in a real product means bank
 * verification (micro-deposits or an account-verification API), which is well
 * outside a mocked payout flow — so accounts are seeded and created at signup
 * rather than pretending a POST here would be meaningful.
 */
@ApiTags('bank-accounts')
@ApiCookieAuth()
@Controller('bank-accounts')
export class BankAccountsController {
  constructor(private readonly bankAccounts: BankAccountsService) {}

  @Get()
  @ApiOperation({ summary: 'Payout destinations for the signed-in merchant' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.bankAccounts.listForMerchant(user.merchantId);
  }
}

@Module({
  controllers: [BankAccountsController],
  providers: [BankAccountsRepository, BankAccountsService],
  exports: [BankAccountsService],
})
export class BankAccountsModule {}
