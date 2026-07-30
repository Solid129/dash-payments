/**
 * Builds a value-and-type pair from a Drizzle `pgEnum`'s values, mirroring how
 * Prisma's generated enums worked (`TransactionStatus.SUCCEEDED` as a value,
 * `TransactionStatus` as a type) — used both for ergonomic call sites
 * (`@Roles(UserRole.OWNER)`) and because `class-validator`'s `@IsEnum()`
 * needs an object of allowed values, not just a TS union type, to validate
 * against.
 */
export function enumObject<T extends readonly string[]>(values: T): { [K in T[number]]: K } {
  return Object.fromEntries(values.map((value) => [value, value])) as { [K in T[number]]: K };
}
