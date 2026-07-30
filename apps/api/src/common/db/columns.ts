import { timestamp } from 'drizzle-orm/pg-core';

/**
 * A DateTime column matching Prisma's old default precision/mode:
 * `TIMESTAMP(3)`, no timezone, returned as a JS `Date`. Shared by every
 * domain schema file so they don't each have to restate it.
 */
export const timestamptz = (name: string) => timestamp(name, { precision: 3, mode: 'date' });
