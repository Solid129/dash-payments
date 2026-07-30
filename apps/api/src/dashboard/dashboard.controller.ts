import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { UserService } from '../user/user.service';
import { DashboardService } from './dashboard.service';
import { RevenueGranularity } from '../payments/transactions/transactions.service';

class PeriodQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // Bounded: an unbounded `days` would let a client ask for an arbitrarily
  // expensive scan and an arbitrarily large gap-filled array.
  @Max(365)
  days?: number;
}

class LimitQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

class RevenueSeriesQueryDto extends PeriodQueryDto {
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  granularity?: RevenueGranularity;
}

class MonthsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months?: number;
}

@ApiTags('dashboard')
@ApiCookieAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly users: UserService,
  ) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Headline metrics with period-over-period deltas',
    description:
      'Balances come from the ledger; volume metrics compare against the preceding window of equal length.',
  })
  async summary(@CurrentUser() user: AuthenticatedUser, @Query() query: PeriodQueryDto) {
    const currency = await this.currencyFor(user.merchantId);
    return this.dashboard.summary(user.merchantId, currency, query.days ?? 30);
  }

  @Get('volume-series')
  @ApiOperation({
    summary: 'Daily settled volume, gap-filled',
    description: 'One point per day, including zero-volume days.',
  })
  async volumeSeries(@CurrentUser() user: AuthenticatedUser, @Query() query: PeriodQueryDto) {
    return this.dashboard.volumeSeries(user.merchantId, query.days ?? 30);
  }

  @Get('revenue-series')
  @ApiOperation({
    summary: 'Revenue composition by granularity (day/week/month), gap-filled',
    description:
      'Net revenue, fees, and refunds bucketed and gap-filled, so the chart can show what a gross number is made of.',
  })
  async revenueSeries(@CurrentUser() user: AuthenticatedUser, @Query() query: RevenueSeriesQueryDto) {
    return this.dashboard.revenueSeries(user.merchantId, query.days ?? 30, query.granularity ?? 'day');
  }

  @Get('revenue-by-method')
  @ApiOperation({
    summary: 'Revenue breakdown by payment method for the window',
    description: 'Always returns every method in a fixed order, zero-filled — never sorted by value.',
  })
  async revenueByMethod(@CurrentUser() user: AuthenticatedUser, @Query() query: PeriodQueryDto) {
    return this.dashboard.revenueByMethod(user.merchantId, query.days ?? 30);
  }

  @Get('recent-transactions')
  @ApiOperation({ summary: 'Latest activity for the dashboard feed' })
  async recent(@CurrentUser() user: AuthenticatedUser, @Query() query: LimitQueryDto) {
    return this.dashboard.recentTransactions(user.merchantId, query.limit ?? 8);
  }

  @Get('status-breakdown')
  @ApiOperation({ summary: 'Transaction status distribution for the window' })
  async statusBreakdown(@CurrentUser() user: AuthenticatedUser, @Query() query: PeriodQueryDto) {
    return this.dashboard.statusBreakdown(user.merchantId, query.days ?? 30);
  }

  @Get('payout-history')
  @ApiOperation({ summary: 'Monthly payout amounts, completed vs pending, gap-filled' })
  async payoutHistory(@CurrentUser() user: AuthenticatedUser, @Query() query: MonthsQueryDto) {
    return this.dashboard.payoutHistory(user.merchantId, query.months ?? 6);
  }

  /**
   * The merchant's reporting currency. Read from the merchant record rather than
   * accepted from the client, so a request can't ask for totals in a currency the
   * merchant doesn't trade in.
   */
  private async currencyFor(merchantId: string): Promise<string> {
    const merchant = await this.users.getMerchantById(merchantId);
    return merchant.defaultCurrency;
  }
}
