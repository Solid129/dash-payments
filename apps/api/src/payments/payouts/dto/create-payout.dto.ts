import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsPositive, IsString, IsUUID, Length } from 'class-validator';

export class CreatePayoutDto {
  @ApiProperty({ description: 'Amount in minor units (e.g. paise)', example: 250000 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  amountMinor!: number;

  @ApiProperty({ example: 'INR' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiProperty()
  @IsUUID()
  bankAccountId!: string;
}
