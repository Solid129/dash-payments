import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PAYOUT_EVENT_TYPES } from '../../payout-state-machine';

export class PayoutWebhookDataDto {
  @ApiProperty()
  @IsUUID()
  payoutId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  pspReference!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(32)
  status!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountMinor!: number;

  @ApiProperty()
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  failureCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  failureReason?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  estimatedArrivalAt?: string;
}

/**
 * Inbound webhooks are validated exactly as strictly as any other request body.
 *
 * A signed payload proves *who* sent it, not that its contents are well-formed —
 * and this handler writes to the ledger, so a malformed field reaching the
 * database would be worse here than on a user-facing endpoint, not better.
 */
export class PayoutWebhookDto {
  @ApiProperty({ description: 'Provider event id; the idempotency key' })
  @IsString()
  @MaxLength(64)
  id!: string;

  @ApiProperty({ enum: Object.keys(PAYOUT_EVENT_TYPES) })
  @IsIn(Object.keys(PAYOUT_EVENT_TYPES))
  type!: keyof typeof PAYOUT_EVENT_TYPES;

  @ApiProperty()
  @IsISO8601()
  createdAt!: string;

  @ApiProperty({ type: PayoutWebhookDataDto })
  @ValidateNested()
  @Type(() => PayoutWebhookDataDto)
  data!: PayoutWebhookDataDto;
}
