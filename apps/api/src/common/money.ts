/**
 * Money helpers.
 *
 * Every amount that crosses a boundary in this app is an integer count of minor
 * units (paise for INR, cents for USD) plus a currency code. Floats are never
 * used for money — `0.1 + 0.2 !== 0.3` is not an acceptable property for a
 * balance — so the only place decimals appear is at the display edge.
 */

/** Minor units per major unit. Extend as currencies are added. */
const MINOR_UNIT_EXPONENT: Record<string, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
};

export const SUPPORTED_CURRENCIES = Object.keys(MINOR_UNIT_EXPONENT);

export function minorUnitExponent(currency: string): number {
  const exponent = MINOR_UNIT_EXPONENT[currency.toUpperCase()];
  if (exponent === undefined) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  return exponent;
}

/** `12345` + `INR` -> `123.45`. Display only; never feed the result back in. */
export function toMajorUnits(amountMinor: number, currency: string): number {
  return amountMinor / 10 ** minorUnitExponent(currency);
}

/** `123.45` + `INR` -> `12345`, rounded to the nearest minor unit. */
export function toMinorUnits(amountMajor: number, currency: string): number {
  return Math.round(amountMajor * 10 ** minorUnitExponent(currency));
}

/**
 * Processing fee for a payment: 2% + a fixed component, rounded to the nearest
 * minor unit. Real pricing varies by method and region; a single flat rule keeps
 * the seeded data internally consistent and the arithmetic checkable by hand.
 */
export const FEE_PERCENTAGE_BPS = 200; // 2.00% in basis points
export const FEE_FIXED_MINOR = 300; // e.g. ₹3.00

export function calculateFee(amountMinor: number): number {
  return Math.round((amountMinor * FEE_PERCENTAGE_BPS) / 10_000) + FEE_FIXED_MINOR;
}

/** Server-side formatting, used for webhook/audit descriptions and logs. */
export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: minorUnitExponent(currency),
  }).format(toMajorUnits(amountMinor, currency));
}
