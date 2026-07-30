import { BankAccountStatus } from './bank-accounts/bank-accounts.schema';

/**
 * Payout validation, as pure functions.
 *
 * These live apart from the service and touch neither Prisma nor Nest, for three
 * reasons:
 *
 *  1. They are the rules most worth testing exhaustively, and a pure function
 *     over a plain object is testable without a database or a DI container.
 *  2. Keeping them out of the service means the service reads as "gather facts,
 *     apply rules, commit" rather than interleaving I/O with policy.
 *  3. The limits become a single declared object that can be served to the client,
 *     so the form can show the same thresholds the server enforces instead of
 *     hardcoding a second copy that drifts.
 */

export interface PayoutLimits {
  minimumMinor: number;
  maximumMinor: number;
  dailyCapMinor: number;
  maxInFlight: number;
}

/**
 * Chosen to be demonstrable rather than to mirror any particular provider: the
 * seeded merchant's balance is comfortably above the minimum and below the daily
 * cap, so a reviewer can trip each rule on purpose without arranging data.
 */
export const DEFAULT_PAYOUT_LIMITS: PayoutLimits = {
  minimumMinor: 10_000, // 100.00
  maximumMinor: 50_000_000, // 500,000.00
  dailyCapMinor: 100_000_000, // 1,000,000.00 across all payouts in a day
  maxInFlight: 3,
};

/** The facts a payout decision needs, all gathered before any rule runs. */
export interface PayoutContext {
  amountMinor: number;
  currency: string;
  merchantCurrency: string;
  availableMinor: number;
  /** Sum of today's payouts that haven't failed. */
  todaysTotalMinor: number;
  /** Payouts currently PENDING or PROCESSING. */
  inFlightCount: number;
  bankAccount: {
    id: string;
    /** Resolved from the merchant's own accounts; see `ownedByMerchant`. */
    ownedByMerchant: boolean;
    status: BankAccountStatus;
    currency: string;
  } | null;
  limits?: PayoutLimits;
}

export type PayoutRejectionCode =
  | 'amount_invalid'
  | 'amount_below_minimum'
  | 'amount_above_maximum'
  | 'currency_mismatch'
  | 'destination_not_found'
  | 'destination_not_verified'
  | 'destination_currency_mismatch'
  | 'insufficient_balance'
  | 'daily_cap_exceeded'
  | 'too_many_in_flight';

export interface PayoutRejection {
  code: PayoutRejectionCode;
  /** The form field this belongs to, so the UI can render it inline. */
  field: 'amountMinor' | 'bankAccountId' | 'currency';
  message: string;
}

/**
 * Returns the first reason this payout must be refused, or `null` if it may
 * proceed.
 *
 * Order matters and is intentional: cheap structural checks first, then the
 * destination, then the balance-dependent rules. A merchant who typed a negative
 * amount into an unverified account should be told about the amount — the thing
 * they most recently touched — rather than being sent to fix the destination and
 * then bounced again.
 */
export function validatePayout(context: PayoutContext): PayoutRejection | null {
  const limits = context.limits ?? DEFAULT_PAYOUT_LIMITS;
  const { amountMinor } = context;

  // 1. The amount is a sane integer count of minor units.
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    return {
      code: 'amount_invalid',
      field: 'amountMinor',
      message: 'Enter a payout amount greater than zero.',
    };
  }

  // 2. Currency agreement. Checked before the balance, since comparing amounts
  //    across currencies is meaningless — the balance figure would be nonsense.
  if (context.currency !== context.merchantCurrency) {
    return {
      code: 'currency_mismatch',
      field: 'currency',
      message: `Payouts must be in ${context.merchantCurrency}.`,
    };
  }

  // 3. Per-payout bounds.
  if (amountMinor < limits.minimumMinor) {
    return {
      code: 'amount_below_minimum',
      field: 'amountMinor',
      message: `The minimum payout is ${formatLimit(limits.minimumMinor)}.`,
    };
  }

  if (amountMinor > limits.maximumMinor) {
    return {
      code: 'amount_above_maximum',
      field: 'amountMinor',
      message: `The maximum single payout is ${formatLimit(limits.maximumMinor)}.`,
    };
  }

  // 4. The destination. "Not owned by this merchant" and "does not exist" collapse
  //    into the same message on purpose: telling a caller that an id exists but
  //    belongs to someone else is an enumeration oracle.
  const { bankAccount } = context;
  if (!bankAccount || !bankAccount.ownedByMerchant) {
    return {
      code: 'destination_not_found',
      field: 'bankAccountId',
      message: 'Choose a payout destination.',
    };
  }

  if (bankAccount.status !== BankAccountStatus.VERIFIED) {
    return {
      code: 'destination_not_verified',
      field: 'bankAccountId',
      message:
        bankAccount.status === BankAccountStatus.DISABLED
          ? 'That account is disabled. Choose another destination.'
          : 'That account is still being verified. Choose a verified destination.',
    };
  }

  if (bankAccount.currency !== context.currency) {
    return {
      code: 'destination_currency_mismatch',
      field: 'bankAccountId',
      message: `That account can only receive ${bankAccount.currency}.`,
    };
  }

  // 5. Funds. Only settled money counts — pending balance is money in transit
  //    that we cannot forward on yet.
  if (amountMinor > context.availableMinor) {
    return {
      code: 'insufficient_balance',
      field: 'amountMinor',
      message: `That exceeds your available balance of ${formatLimit(context.availableMinor)}.`,
    };
  }

  // 6. Velocity limits. These are the rules a real provider imposes to bound the
  //    damage from a compromised account, and they are the reason the daily total
  //    and in-flight count have to be gathered even on a well-formed request.
  if (context.todaysTotalMinor + amountMinor > limits.dailyCapMinor) {
    const remaining = Math.max(limits.dailyCapMinor - context.todaysTotalMinor, 0);
    return {
      code: 'daily_cap_exceeded',
      field: 'amountMinor',
      message:
        remaining === 0
          ? `You've reached today's payout limit of ${formatLimit(limits.dailyCapMinor)}. Try again tomorrow.`
          : `That would exceed today's payout limit. You can pay out up to ${formatLimit(remaining)} more today.`,
    };
  }

  if (context.inFlightCount >= limits.maxInFlight) {
    return {
      code: 'too_many_in_flight',
      field: 'amountMinor',
      message: `You already have ${limits.maxInFlight} payouts in progress. Wait for one to complete.`,
    };
  }

  return null;
}

/**
 * Formats a minor-unit amount for an error message.
 *
 * Currency-agnostic on purpose: these strings are assembled server-side where the
 * user's locale isn't known, so they show a plain grouped decimal and let the UI
 * own symbol placement.
 */
function formatLimit(amountMinor: number): string {
  return (amountMinor / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
