import PostgresErrorImport from 'postgres';

/**
 * The `postgres` package's default export is a callable factory, and
 * `PostgresError` hangs off it as a named property rather than a named module
 * export — see node_modules/postgres/cjs/src/index.js. Centralized here so
 * the awkward cast happens once.
 */
export const PostgresError = (PostgresErrorImport as unknown as { PostgresError: typeof Error })
  .PostgresError;

/**
 * Drizzle wraps every driver error in its own `DrizzleQueryError`, with the
 * real `postgres` package error underneath as `.cause` — so the SQLSTATE code
 * has to be read off whichever of the two actually carries it.
 */
export function asPostgresError(error: unknown): (Error & { code?: string }) | undefined {
  if (error instanceof PostgresError) {
    return error as Error & { code?: string };
  }
  const cause = (error as { cause?: unknown } | undefined)?.cause;
  return cause instanceof PostgresError ? (cause as Error & { code?: string }) : undefined;
}

export function isPostgresErrorCode(error: unknown, code: string): boolean {
  return asPostgresError(error)?.code === code;
}
