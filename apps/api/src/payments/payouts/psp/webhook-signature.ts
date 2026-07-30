import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC signing for PSP webhook deliveries, following the scheme Stripe and
 * similar providers use.
 *
 * The header carries a timestamp and a digest:
 *
 *     X-Psp-Signature: t=1769...,v1=9f86d0818...
 *
 * and the signed payload is `${timestamp}.${rawBody}`.
 *
 * The timestamp is inside the signed material rather than alongside it, which is
 * what makes replay protection work: an attacker who captures a valid delivery
 * cannot move its timestamp forward without invalidating the digest, so the
 * tolerance window below actually bounds how long a captured request stays usable.
 * A signature over the body alone would be replayable forever.
 *
 * Both sides live in one file so the signer and the verifier cannot drift apart —
 * a mismatch in what gets signed is the classic way this breaks.
 */

export const SIGNATURE_HEADER = 'x-psp-signature';
export const EVENT_ID_HEADER = 'x-psp-event-id';

/** How old a delivery may be and still be accepted. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function signPayload(rawBody: string, secret: string, timestampSeconds: number): string {
  const digest = createHmac('sha256', secret).update(`${timestampSeconds}.${rawBody}`).digest('hex');

  return `t=${timestampSeconds},v1=${digest}`;
}

export interface ParsedSignature {
  timestampSeconds: number;
  digest: string;
}

export function parseSignatureHeader(header: string | undefined): ParsedSignature | null {
  if (!header) return null;

  let timestampSeconds: number | null = null;
  let digest: string | null = null;

  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;

    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();

    if (key === 't') {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) return null;
      timestampSeconds = parsed;
    } else if (key === 'v1') {
      // Reject anything that isn't a plausible hex digest before we try to
      // Buffer-compare it.
      if (!/^[a-f0-9]{64}$/i.test(value)) return null;
      digest = value;
    }
  }

  if (timestampSeconds === null || digest === null) return null;
  return { timestampSeconds, digest };
}

export type VerificationFailure =
  'missing_signature' | 'malformed_signature' | 'timestamp_out_of_tolerance' | 'digest_mismatch';

export type VerificationResult = { valid: true } | { valid: false; reason: VerificationFailure };

export function verifySignature(options: {
  rawBody: string;
  header: string | undefined;
  secret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): VerificationResult {
  const { rawBody, header, secret } = options;
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;

  if (!header) return { valid: false, reason: 'missing_signature' };

  const parsed = parseSignatureHeader(header);
  if (!parsed) return { valid: false, reason: 'malformed_signature' };

  // Absolute difference, so a timestamp implausibly far in the *future* is
  // rejected too — that indicates a forged header or badly skewed clocks, not a
  // slow network.
  if (Math.abs(nowSeconds - parsed.timestampSeconds) > tolerance) {
    return { valid: false, reason: 'timestamp_out_of_tolerance' };
  }

  const expected = createHmac('sha256', secret).update(`${parsed.timestampSeconds}.${rawBody}`).digest();
  const received = Buffer.from(parsed.digest, 'hex');

  // Length check first: timingSafeEqual throws on a length mismatch rather than
  // returning false. The regex above already guarantees 32 bytes, so this is
  // belt-and-braces against a future change to the parser.
  if (expected.length !== received.length) {
    return { valid: false, reason: 'digest_mismatch' };
  }

  // Constant-time comparison. A plain `===` leaks how many leading bytes matched
  // through timing, which is enough to forge a digest one byte at a time.
  if (!timingSafeEqual(expected, received)) {
    return { valid: false, reason: 'digest_mismatch' };
  }

  return { valid: true };
}
