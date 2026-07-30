import { PayoutStatus } from './payouts.schema';

/**
 * The payout lifecycle, as an explicit transition table.
 *
 *     PENDING ──> PROCESSING ──> PAID
 *        │             │
 *        └─────────────┴───────> FAILED
 *
 * Why a table rather than a chain of `if` statements in the webhook handler:
 * transitions arrive from an outside system over the network, which means they
 * arrive **out of order, duplicated, and occasionally contradicting each other**.
 * Enumerating what is legal makes the illegal cases a single lookup instead of a
 * growing pile of defensive conditionals, and makes them testable in isolation.
 */
const ALLOWED_TRANSITIONS: Record<PayoutStatus, readonly PayoutStatus[]> = {
  [PayoutStatus.PENDING]: [PayoutStatus.PROCESSING, PayoutStatus.PAID, PayoutStatus.FAILED],
  // PENDING -> PAID is permitted: if the `processing` callback is lost or
  // delivered late, a payout that genuinely settled must still be able to reach
  // PAID. Refusing the terminal truth because an intermediate notice went missing
  // would strand the payout forever.
  [PayoutStatus.PROCESSING]: [PayoutStatus.PAID, PayoutStatus.FAILED],
  // Terminal. Money has either arrived or been returned; nothing an inbound
  // message says should reopen that.
  [PayoutStatus.PAID]: [],
  [PayoutStatus.FAILED]: [],
};

export const TERMINAL_PAYOUT_STATUSES: readonly PayoutStatus[] = [PayoutStatus.PAID, PayoutStatus.FAILED];

export const IN_FLIGHT_PAYOUT_STATUSES: readonly PayoutStatus[] = [
  PayoutStatus.PENDING,
  PayoutStatus.PROCESSING,
];

export function isTerminal(status: PayoutStatus): boolean {
  return TERMINAL_PAYOUT_STATUSES.includes(status);
}

export function canTransition(from: PayoutStatus, to: PayoutStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export type TransitionVerdict =
  /** Apply it. */
  | { kind: 'apply' }
  /**
   * The payout is already in the target state. Not an error: this is what a
   * provider retry looks like once the original delivery has been applied.
   */
  | { kind: 'noop'; reason: string }
  /** Contradicts a state we've already committed to; record and ignore. */
  | { kind: 'illegal'; reason: string };

/**
 * Decides what to do with an inbound transition.
 *
 * Note that nothing here returns an error. A webhook receiver that answers 4xx to
 * a message it dislikes teaches the provider to redeliver it forever — the correct
 * response to "I can't use this" is to acknowledge receipt and drop it, which is
 * why the caller maps every verdict to a 200.
 */
export function evaluateTransition(from: PayoutStatus, to: PayoutStatus): TransitionVerdict {
  if (from === to) {
    return { kind: 'noop', reason: `Payout is already ${to}.` };
  }

  if (!canTransition(from, to)) {
    return {
      kind: 'illegal',
      reason: isTerminal(from)
        ? `Payout is already in the terminal state ${from}; refusing to move it to ${to}.`
        : `${from} -> ${to} is not a permitted transition.`,
    };
  }

  return { kind: 'apply' };
}

/** The webhook event types the mock provider emits, mapped to target states. */
export const PAYOUT_EVENT_TYPES = {
  'payout.processing': PayoutStatus.PROCESSING,
  'payout.paid': PayoutStatus.PAID,
  'payout.failed': PayoutStatus.FAILED,
} as const;

export type PayoutEventType = keyof typeof PAYOUT_EVENT_TYPES;

export function isPayoutEventType(value: string): value is PayoutEventType {
  return value in PAYOUT_EVENT_TYPES;
}

export function targetStatusFor(type: PayoutEventType): PayoutStatus {
  return PAYOUT_EVENT_TYPES[type];
}
