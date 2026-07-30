import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const SIMULATABLE_EVENTS = ['processing', 'paid', 'failed'] as const;
export type SimulatableEvent = (typeof SIMULATABLE_EVENTS)[number];

export class SimulatePayoutDto {
  @ApiProperty({ enum: SIMULATABLE_EVENTS })
  @IsIn(SIMULATABLE_EVENTS)
  event!: SimulatableEvent;

  @ApiProperty({ required: false, example: 'account_details_invalid' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  failureCode?: string;
}
