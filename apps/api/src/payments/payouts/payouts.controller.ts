import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { Response } from 'express';

import { UserRole } from '../../user/user.schema';
import { toCsv } from '../../common/csv';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { SimulatePayoutDto } from './dto/simulate-payout.dto';
import { DEFAULT_PAYOUT_LIMITS } from './payout-rules';
import { PayoutsService } from './payouts.service';
import { PayoutStatus } from './payouts.schema';

type ExportablePayout = Awaited<ReturnType<PayoutsService['listForExport']>>[number];

class QueryPayoutsDto {
  @IsOptional()
  @IsEnum(PayoutStatus)
  status?: PayoutStatus;
}

@ApiTags('payouts')
@ApiBearerAuth()
@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get('limits')
  @ApiOperation({ summary: 'The current payout limits, so the form can validate before submitting' })
  limits() {
    return DEFAULT_PAYOUT_LIMITS;
  }

  @Get()
  @ApiOperation({ summary: 'List payouts, optionally filtered by status' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryPayoutsDto) {
    return this.payouts.list(user.merchantId, query.status);
  }

  // Declared before ':id' for the same reason as the transactions controller's
  // 'export' route — see the comment there.
  @Get('export')
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Export payouts as CSV', description: 'Same status filter as the list endpoint.' })
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryPayoutsDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const rows = await this.payouts.listForExport(user.merchantId, query.status);
    const csv = toCsv<ExportablePayout>(rows, [
      { header: 'Date', value: (r) => r.createdAt.toISOString() },
      { header: 'Reference', value: (r) => r.reference },
      { header: 'Status', value: (r) => r.status },
      { header: 'Amount', value: (r) => (r.amountMinor / 100).toFixed(2) },
      { header: 'Currency', value: (r) => r.currency },
      { header: 'Bank', value: (r) => r.bankAccount.bankName },
      { header: 'Account Last 4', value: (r) => r.bankAccount.last4 },
      { header: 'Initiated By', value: (r) => r.initiatedBy?.fullName },
      { header: 'PSP Reference', value: (r) => r.pspReference },
      { header: 'Failure Reason', value: (r) => r.failureReason },
      { header: 'Paid At', value: (r) => r.paidAt?.toISOString() },
    ]);

    response.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payouts-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
    return new StreamableFile(Buffer.from(csv, 'utf-8'));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Payout detail, including the webhook events that drove its state' })
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payouts.findOne(user.merchantId, id);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'A repeated key returns the original payout instead of creating a second one.',
  })
  @ApiOperation({
    summary: 'Initiate a payout',
    description:
      'Validates synchronously and reserves the balance, then returns 202 immediately. ' +
      'A mock payment provider drives the payout to PROCESSING and then PAID (or FAILED) via ' +
      'signed webhooks; poll GET /payouts/:id to observe the transition.',
  })
  @ApiResponse({ status: 202, description: 'Accepted; payout is PENDING' })
  @ApiResponse({ status: 400, description: 'Validation failed — see fieldErrors' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.payouts.create(user.merchantId, user.userId, dto, idempotencyKey);
  }

  @Post(':id/simulate')
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[dev only] Force the next webhook event for a payout',
    description:
      'Not available when NODE_ENV=production. Lets a reviewer see every payout state without ' +
      "waiting for the mock provider's timers.",
  })
  async simulate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SimulatePayoutDto,
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    await this.payouts.simulate(user.merchantId, id, dto.event, dto.failureCode);
    return { success: true };
  }
}
