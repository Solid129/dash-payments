import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public } from '../../../common/decorators/public.decorator';
import { PayoutWebhookDto } from './dto/payout-webhook.dto';
import { PayoutWebhooksService } from './payout-webhooks.service';
import { PspSignatureGuard } from './psp-signature.guard';

/**
 * The one route in the app authenticated by something other than the session
 * cookie. Excluded from Swagger since it isn't callable from a browser session —
 * documenting it there would invite someone to try it from "Try it out" and get a
 * confusing 401 with no cookie-auth explanation.
 */
@ApiExcludeController()
@Controller('webhooks/payouts')
export class PayoutWebhooksController {
  constructor(private readonly webhooks: PayoutWebhooksService) {}

  @Public()
  @UseGuards(PspSignatureGuard)
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(@Body() payload: PayoutWebhookDto) {
    // Always 200 on a signed, well-formed request — see payout-state-machine.ts
    // for why a webhook receiver must never 4xx a message it merely disagrees with.
    const result = await this.webhooks.handle(payload);
    return { received: true, outcome: result.outcome };
  }
}
