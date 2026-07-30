import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser, CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../user/user.schema';
import { UpdateAutoPayoutScheduleDto } from './dto/update-auto-payout-schedule.dto';
import { AutoPayoutSchedulerService } from './auto-payout-scheduler.service';
import { AutoPayoutService } from './auto-payout.service';

@ApiTags('payout-schedule')
@ApiCookieAuth()
@Controller('payout-schedule')
export class AutoPayoutController {
  constructor(
    private readonly schedules: AutoPayoutService,
    private readonly scheduler: AutoPayoutSchedulerService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the automatic payout schedule for your merchant' })
  async getSchedule(@CurrentUser() user: AuthenticatedUser) {
    return this.schedules.getForMerchant(user.merchantId);
  }

  @Put()
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Update the automatic payout schedule' })
  async updateSchedule(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateAutoPayoutScheduleDto) {
    return this.schedules.updateForMerchant(user.merchantId, dto);
  }

  @Post('trigger-now')
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[dev only] Trigger an automatic payout immediately',
    description:
      'Not available when NODE_ENV=production. Lets a reviewer see an automatic payout fire ' +
      'without waiting for the scheduled time or threshold.',
  })
  async triggerNow(@CurrentUser() user: AuthenticatedUser) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    await this.scheduler.triggerNowForMerchant(user.merchantId);
    return { success: true };
  }
}
