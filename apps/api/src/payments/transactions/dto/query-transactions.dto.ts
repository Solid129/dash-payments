import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { PaymentMethod, TransactionStatus, TransactionType } from '../transactions.schema';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** `?status=FAILED&status=PENDING` and `?status=FAILED,PENDING` both work. */
const toArray = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
};

export const TRANSACTION_SORT_FIELDS = ['createdAt', 'amountMinor'] as const;
export type TransactionSortField = (typeof TRANSACTION_SORT_FIELDS)[number];

export class QueryTransactionsDto {
  @ApiPropertyOptional({ enum: TransactionStatus, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(TransactionStatus, { each: true })
  status?: TransactionStatus[];

  @ApiPropertyOptional({ enum: PaymentMethod, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(PaymentMethod, { each: true })
  method?: PaymentMethod[];

  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ description: 'Inclusive lower bound (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Inclusive upper bound (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Minimum amount in minor units' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountMin?: number;

  @ApiPropertyOptional({ description: 'Maximum amount in minor units' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountMax?: number;

  @ApiPropertyOptional({
    description: 'Free-text search across reference, description, and customer name/email',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  // Bounded so an enormous string can't be used to make the database do
  // unbounded work on an ILIKE scan.
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: TRANSACTION_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(TRANSACTION_SORT_FIELDS)
  sortBy?: TransactionSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Opaque cursor from the previous page (`nextCursor`)',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
