import { NotFoundException } from '@nestjs/common';

/**
 * Replaces Prisma's `findUniqueOrThrow`. Drizzle's reads just return
 * `undefined` on a miss — there's no ORM-level equivalent that throws — so
 * every call site that relied on that (a row whose existence is already
 * guaranteed by referential integrity or prior business logic, where a miss
 * is a genuine bug rather than an expected 404) makes that explicit here
 * instead of leaning on a synthesized error code from the exception filter.
 */
export function findOrThrow<T>(
  row: T | undefined,
  message = 'The requested resource could not be found.',
): T {
  if (!row) {
    throw new NotFoundException(message);
  }
  return row;
}
