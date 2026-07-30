import { ExtractTablesWithRelations } from 'drizzle-orm';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { PostgresJsDatabase, PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';

import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * The client available inside `db.transaction(async (tx) => {...})`.
 *
 * Services that may be composed into a larger unit of work accept `Db` (the
 * union below) for their "which connection to run on" parameter and default
 * it to the root `Database` instance, so a caller can decide whether the work
 * happens in its own transaction or joins an existing one — without the
 * service having to know which. Replaces `PrismaTransactionClient`.
 */
export type DrizzleTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export type Db = Database | DrizzleTransaction;
