import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateReportSubscriptionDto } from './dto/update-report-subscription.dto';
import { ReportSchedulerService } from './report-scheduler.service';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiCookieAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly subscriptions: ReportsService,
    private readonly scheduler: ReportSchedulerService,
  ) {}

  @Get('subscription')
  @ApiOperation({ summary: "The signed-in user's report-email preference" })
  async getSubscription(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptions.getForUser(user.userId);
  }

  @Put('subscription')
  @ApiOperation({ summary: 'Enable, change, or turn off scheduled report emails' })
  async updateSubscription(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateReportSubscriptionDto) {
    return this.subscriptions.updateForUser(user.userId, dto.frequency);
  }

  @Post('subscription/send-now')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[dev only] Send the current report immediately',
    description:
      'Not available when NODE_ENV=production. Lets a reviewer see what the scheduled email would ' +
      'contain without waiting for the weekly/monthly interval.',
  })
  async sendNow(@CurrentUser() user: AuthenticatedUser) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    return this.scheduler.sendNow(user.userId, user.merchantId, user.email);
  }
}
