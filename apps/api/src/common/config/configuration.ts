import { plainToInstance, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

/**
 * Environment validation.
 *
 * The app refuses to boot with a missing or too-short secret rather than
 * starting up and quietly signing tokens with `undefined`. Failing at boot is
 * the only failure mode here that can't reach production unnoticed.
 */
export class EnvironmentVariables {
  @IsEnum(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @Type(() => Number)
  @IsInt()
  PORT = 3000;

  @IsString()
  DATABASE_URL!: string;

  @MinLength(16, { message: 'JWT_ACCESS_SECRET must be at least 16 characters' })
  JWT_ACCESS_SECRET!: string;

  @MinLength(16, { message: 'JWT_REFRESH_SECRET must be at least 16 characters' })
  JWT_REFRESH_SECRET!: string;

  @IsString()
  JWT_ACCESS_TTL = '15m';

  @IsString()
  JWT_REFRESH_TTL = '7d';

  @IsString()
  WEB_ORIGIN = 'http://localhost:5173';

  @MinLength(16, { message: 'PSP_WEBHOOK_SECRET must be at least 16 characters' })
  PSP_WEBHOOK_SECRET!: string;

  @IsString()
  PSP_CALLBACK_URL = 'http://localhost:3000/api/webhooks/payouts';

  @Type(() => Number)
  @IsInt()
  PSP_PROCESSING_DELAY_MS = 2500;

  @Type(() => Number)
  @IsInt()
  PSP_SETTLEMENT_DELAY_MS = 8000;

  @IsOptional()
  @IsString()
  TEST_DATABASE_URL?: string;
}

export function validateEnvironment(raw: Record<string, unknown>): EnvironmentVariables {
  const config = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(config, { skipMissingProperties: false, whitelist: false });
  if (errors.length > 0) {
    const details = errors.map((error) => Object.values(error.constraints ?? {}).join(', ')).join('\n  - ');
    throw new Error(`Invalid environment configuration:\n  - ${details}`);
  }

  return config;
}
