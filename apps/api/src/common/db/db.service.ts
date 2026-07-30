import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';
import { Database } from './db.types';

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private readonly client: postgres.Sql;
  readonly db: Database;

  constructor(config: ConfigService) {
    // A small pool in test: the e2e suite runs `--runInBand` against a single
    // process, and a large pool there just holds idle connections open.
    const isTest = config.get<string>('NODE_ENV') === 'test';
    this.client = postgres(config.getOrThrow<string>('DATABASE_URL'), {
      max: isTest ? 5 : 10,
    });
    this.db = drizzle(this.client, { schema });
  }

  async onModuleInit(): Promise<void> {
    await this.client`select 1`;
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.end();
  }

  /**
   * Wipes every table. Test-only, and it checks NODE_ENV itself rather than
   * trusting the caller — a helper that can truncate a database should not be
   * one accidental import away from doing it to a real one.
   */
  async truncateAllTables(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('truncateAllTables() is only available when NODE_ENV=test');
    }

    await this.db.execute(sql`
      TRUNCATE TABLE
        webhook_events, ledger_entries, transaction_events, payouts,
        transactions, bank_accounts, customers, refresh_tokens, invitations,
        users, merchants
      RESTART IDENTITY CASCADE;
    `);
  }
}
