import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { ReportFrequency } from '../reports.schema';

export class UpdateReportSubscriptionDto {
  @ApiProperty({ enum: ReportFrequency })
  @IsEnum(ReportFrequency)
  frequency!: ReportFrequency;
}
