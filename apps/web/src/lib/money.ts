/**
 * Money formatting, display-only.
 *
 * The API is the only source of truth for amounts, and it always speaks in
 * integer minor units (paise, cents) plus a currency code — see
 * apps/api/src/common/money.ts. This file's job is strictly one-way: turn that
 * into something readable. Nothing here is ever fed back into a request.
 */

const MINOR_UNIT_EXPONENT: Record<string, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
};

export function toMajorUnits(amountMinor: number, currency: string): number {
  const exponent = MINOR_UNIT_EXPONENT[currency.toUpperCase()] ?? 2;
  return amountMinor / 10 ** exponent;
}

export function toMinorUnits(amountMajor: number, currency: string): number {
  const exponent = MINOR_UNIT_EXPONENT[currency.toUpperCase()] ?? 2;
  return Math.round(amountMajor * 10 ** exponent);
}

export function formatMoney(amountMinor: number, currency: string, options: { signDisplay?: 'always' | 'auto' } = {}): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: MINOR_UNIT_EXPONENT[currency.toUpperCase()] ?? 2,
    signDisplay: options.signDisplay ?? 'auto',
  }).format(toMajorUnits(amountMinor, currency));
}

export function formatCompactMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(toMajorUnits(amountMinor, currency));
}

export function formatPercent(value: number | null, options: { signDisplay?: 'always' | 'auto' } = {}): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: options.signDisplay ?? 'auto',
  }).format(value / 100);
}
