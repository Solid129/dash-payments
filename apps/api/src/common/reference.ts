import { randomBytes } from 'node:crypto';

/**
 * Human-quotable public identifiers, in the shape payment providers use:
 * a type prefix plus random suffix (`txn_k3f9d2ax`).
 *
 * These are deliberately NOT the primary keys. Primary keys are UUIDs; these
 * are what a merchant reads off a screen and quotes to support, which means they
 * need to be short and unambiguous rather than globally unique on their own —
 * uniqueness is enforced per merchant by a database constraint.
 */

// No 0/O/1/I/l — a merchant reading a reference aloud shouldn't have to guess.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function randomSuffix(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function transactionReference(): string {
  return `txn_${randomSuffix(10)}`;
}

export function payoutReference(): string {
  return `po_${randomSuffix(10)}`;
}

export function pspReference(): string {
  return `psp_tr_${randomSuffix(12)}`;
}

export function webhookEventId(): string {
  return `evt_${randomSuffix(16)}`;
}
