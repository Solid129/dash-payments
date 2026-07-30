/**
 * The barrel Drizzle needs a single object of every table/enum for
 * (`drizzle(client, { schema })`, and what `drizzle-kit` diffs against).
 *
 * The tables themselves live next to the module that owns them — e.g.
 * `apps/api/src/payments/payouts/payouts.schema.ts` — not here. This file only
 * re-assembles them, plus the relation declarations that tie them together
 * for the query API's `with: {...}` (see `relations.ts`).
 */

export * from '../../user/user.schema';
export * from '../../user/team/team.schema';
export * from '../../payments/payouts/bank-accounts/bank-accounts.schema';
export * from '../../payments/transactions/transactions.schema';
export * from '../../payments/payouts/payouts.schema';
export * from '../../payments/payouts/psp/psp.schema';
export * from '../../payments/payouts/auto-payout/auto-payout.schema';
export * from '../../payments/ledger/ledger.schema';
export * from '../../reports/reports.schema';
export * from './relations';
