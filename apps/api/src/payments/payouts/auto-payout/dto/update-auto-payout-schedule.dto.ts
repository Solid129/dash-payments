import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class UpdateAutoPayoutScheduleDto {
  @ApiProperty({ description: 'Enable daily automatic payouts (9 AM UTC)', example: false })
  @IsBoolean()
  dailyEnabled!: boolean;

  @ApiProperty({ description: 'Enable threshold-based automatic payouts', example: false })
  @IsBoolean()
  thresholdEnabled!: boolean;

  @ApiProperty({
    description: 'Threshold amount in minor units (cents); required when thresholdEnabled is true',
    example: 10000,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  thresholdMinor?: number;

  @ApiProperty({
    description: 'Bank account to pay out to; if not provided, the default verified account is used',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  bankAccountId?: string;
}
