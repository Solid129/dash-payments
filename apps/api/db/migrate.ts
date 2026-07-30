/* eslint-disable no-console */
/**
 * Applies pending SQL migrations from `apps/api/drizzle/` to `DATABASE_URL`.
 * Run via `npm run db:migrate`. Equivalent to Prisma's `migrate deploy`.
 */
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

config();

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set.');
  }

  // A single connection is deliberate: migrations must run sequentially, and
  // a pooled client offers nothing here.
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  console.log(`Applying migrations from ./drizzle to ${connectionString.replace(/:[^:]*@/, ':***@')}`);
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
