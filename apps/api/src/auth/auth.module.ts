import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { JwtStrategy } from '../common/auth/jwt.strategy';
import { BankAccountsModule } from '../payments/payouts/bank-accounts/bank-accounts.module';
import { TeamModule } from '../user/team/team.module';
import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenModule } from './token.module';

@Module({
  imports: [PassportModule, TokenModule, UserModule, BankAccountsModule, TeamModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
