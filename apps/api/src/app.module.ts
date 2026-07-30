import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { AutoPayoutModule } from './payments/payouts/auto-payout/auto-payout.module';
import { BankAccountsModule } from './payments/payouts/bank-accounts/bank-accounts.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { validateEnvironment } from './common/config/configuration';
import { DashboardModule } from './dashboard/dashboard.module';
import { DbModule } from './common/db/db.module';
import { HealthController } from './health/health.controller';
import { PayoutsModule } from './payments/payouts/payouts.module';
import { ReportsModule } from './reports/reports.module';
import { TeamModule } from './user/team/team.module';
import { TransactionsModule } from './payments/transactions/transactions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Boot fails loudly on a missing or weak secret rather than starting up in
      // a subtly insecure state.
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        // A generous default so normal dashboard browsing is never throttled;
        // auth routes tighten this with their own named `@Throttle({ auth: … })`.
        { name: 'default', limit: 3000, ttl: 60_000 },
        { name: 'auth', limit: 300, ttl: 60_000 },
      ],
    }),
    ScheduleModule.forRoot(),
    DbModule,
    AuthModule,
    DashboardModule,
    TransactionsModule,
    BankAccountsModule,
    PayoutsModule,
    AutoPayoutModule,
    TeamModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Skipped under test: the e2e suite deliberately hammers /auth/signup and
    // /payouts from a single IP across many cases, which is exactly what this
    // guard exists to rate-limit in production. Excluding it there is more
    // honest than inflating the limits until the tests happen to fit under them.
    ...(process.env.NODE_ENV === 'test' ? [] : [{ provide: APP_GUARD, useClass: ThrottlerGuard }]),
    // Registered after the throttler so rate limiting applies to unauthenticated
    // requests too — otherwise a login flood would be rejected only after the
    // (expensive) auth work had already run.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Runs after JwtAuthGuard so `request.user` is already populated (or the
    // route is @Public()) by the time role membership is checked.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
