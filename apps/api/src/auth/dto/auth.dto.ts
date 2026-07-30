import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

import { SUPPORTED_CURRENCIES } from '../../common/money';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class SignupDto {
  @ApiProperty({ example: 'asha@northwindcoffee.test' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254)
  email!: string;

  /**
   * Length is the only requirement. Composition rules ("one uppercase, one
   * symbol") measurably push people toward `Password1!` while blocking strong
   * passphrases, so we ask for length and hash with argon2id instead.
   */
  @ApiProperty({ example: 'a-long-passphrase', minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'password must be at least 10 characters' })
  @MaxLength(128, { message: 'password must be at most 128 characters' })
  password!: string;

  @ApiProperty({ example: 'Asha Raghavan' })
  @IsString()
  @Length(2, 120)
  fullName!: string;

  @ApiProperty({ example: 'Northwind Coffee' })
  @IsString()
  @Length(2, 160)
  businessName!: string;

  @ApiPropertyOptional({ example: 'IN', description: 'ISO 3166-1 alpha-2' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/, { message: 'country must be a two-letter country code' })
  country?: string;

  @ApiPropertyOptional({ example: 'INR', enum: SUPPORTED_CURRENCIES })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(SUPPORTED_CURRENCIES, { message: `currency must be one of ${SUPPORTED_CURRENCIES.join(', ')}` })
  currency?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'demo@northwindcoffee.test' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'email must be a valid email address' })
  email!: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MaxLength(128)
  password!: string;
}

export class AcceptInviteDto {
  @ApiProperty({ description: 'The token from the invite link' })
  @IsString()
  @Length(1, 512)
  token!: string;

  @ApiProperty({ example: 'a-long-passphrase', minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'password must be at least 10 characters' })
  @MaxLength(128, { message: 'password must be at most 128 characters' })
  password!: string;

  @ApiProperty({ example: 'Priya Nair' })
  @IsString()
  @Length(2, 120)
  fullName!: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'The refresh token issued at login' })
  @IsString()
  @Length(1, 2048)
  refreshToken!: string;
}

export class LogoutDto {
  @ApiPropertyOptional({ description: 'The refresh token to revoke' })
  @IsOptional()
  @IsString()
  @Length(1, 2048)
  refreshToken?: string;
}
