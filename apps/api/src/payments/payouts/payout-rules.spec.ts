import { BankAccountStatus } from './bank-accounts/bank-accounts.schema';
import { DEFAULT_PAYOUT_LIMITS, PayoutContext, validatePayout } from './payout-rules';

function baseContext(overrides: Partial<PayoutContext> = {}): PayoutContext {
  return {
    amountMinor: 50_000,
    currency: 'INR',
    merchantCurrency: 'INR',
    availableMinor: 10_000_000,
    todaysTotalMinor: 0,
    inFlightCount: 0,
    bankAccount: {
      id: 'bank_1',
      ownedByMerchant: true,
      status: BankAccountStatus.VERIFIED,
      currency: 'INR',
    },
    ...overrides,
  };
}

describe('validatePayout', () => {
  it('accepts a well-formed payout within all limits', () => {
    expect(validatePayout(baseContext())).toBeNull();
  });

  it.each([0, -1, -1000])('rejects a non-positive amount (%d)', (amountMinor) => {
    const result = validatePayout(baseContext({ amountMinor }));
    expect(result?.code).toBe('amount_invalid');
    expect(result?.field).toBe('amountMinor');
  });

  it('rejects a non-integer amount', () => {
    const result = validatePayout(baseContext({ amountMinor: 100.5 }));
    expect(result?.code).toBe('amount_invalid');
  });

  it('rejects a currency mismatch against the merchant currency before checking bounds', () => {
    const result = validatePayout(
      baseContext({
        currency: 'USD',
        merchantCurrency: 'INR',
        amountMinor: DEFAULT_PAYOUT_LIMITS.maximumMinor + 1,
      }),
    );
    // Currency is checked before the per-payout bounds, so an otherwise-too-large
    // USD request still reports the currency problem first.
    expect(result?.code).toBe('currency_mismatch');
    expect(result?.field).toBe('currency');
  });

  it('rejects an amount below the minimum', () => {
    const result = validatePayout(baseContext({ amountMinor: DEFAULT_PAYOUT_LIMITS.minimumMinor - 1 }));
    expect(result?.code).toBe('amount_below_minimum');
  });

  it('accepts an amount exactly at the minimum', () => {
    expect(validatePayout(baseContext({ amountMinor: DEFAULT_PAYOUT_LIMITS.minimumMinor }))).toBeNull();
  });

  it('rejects an amount above the maximum', () => {
    const result = validatePayout(
      baseContext({
        amountMinor: DEFAULT_PAYOUT_LIMITS.maximumMinor + 1,
        availableMinor: Number.MAX_SAFE_INTEGER,
      }),
    );
    expect(result?.code).toBe('amount_above_maximum');
  });

  it('accepts an amount exactly at the maximum', () => {
    expect(
      validatePayout(
        baseContext({
          amountMinor: DEFAULT_PAYOUT_LIMITS.maximumMinor,
          availableMinor: Number.MAX_SAFE_INTEGER,
        }),
      ),
    ).toBeNull();
  });

  it('rejects when the bank account is missing', () => {
    const result = validatePayout(baseContext({ bankAccount: null }));
    expect(result?.code).toBe('destination_not_found');
    expect(result?.field).toBe('bankAccountId');
  });

  it('rejects when the bank account belongs to a different merchant, identically to a missing account', () => {
    const notFound = validatePayout(baseContext({ bankAccount: null }));
    const notOwned = validatePayout(
      baseContext({
        bankAccount: {
          id: 'bank_2',
          ownedByMerchant: false,
          status: BankAccountStatus.VERIFIED,
          currency: 'INR',
        },
      }),
    );
    // Same code and message on purpose — see the comment in payout-rules.ts.
    expect(notOwned).toEqual(notFound);
  });

  it('rejects an unverified (PENDING) destination', () => {
    const result = validatePayout(
      baseContext({
        bankAccount: {
          id: 'bank_1',
          ownedByMerchant: true,
          status: BankAccountStatus.PENDING,
          currency: 'INR',
        },
      }),
    );
    expect(result?.code).toBe('destination_not_verified');
  });

  it('rejects a disabled destination with a distinct message from pending', () => {
    const pending = validatePayout(
      baseContext({
        bankAccount: {
          id: 'bank_1',
          ownedByMerchant: true,
          status: BankAccountStatus.PENDING,
          currency: 'INR',
        },
      }),
    );
    const disabled = validatePayout(
      baseContext({
        bankAccount: {
          id: 'bank_1',
          ownedByMerchant: true,
          status: BankAccountStatus.DISABLED,
          currency: 'INR',
        },
      }),
    );
    expect(disabled?.code).toBe('destination_not_verified');
    expect(disabled?.message).not.toEqual(pending?.message);
  });

  it('rejects a destination in a different currency than the request', () => {
    const result = validatePayout(
      baseContext({
        currency: 'INR',
        bankAccount: {
          id: 'bank_1',
          ownedByMerchant: true,
          status: BankAccountStatus.VERIFIED,
          currency: 'USD',
        },
      }),
    );
    expect(result?.code).toBe('destination_currency_mismatch');
  });

  it('rejects an amount above the available balance', () => {
    const result = validatePayout(baseContext({ amountMinor: 20_000, availableMinor: 19_999 }));
    expect(result?.code).toBe('insufficient_balance');
  });

  it('accepts an amount exactly equal to the available balance', () => {
    expect(validatePayout(baseContext({ amountMinor: 20_000, availableMinor: 20_000 }))).toBeNull();
  });

  it('rejects when the daily cap would be exceeded', () => {
    const result = validatePayout(
      baseContext({
        amountMinor: DEFAULT_PAYOUT_LIMITS.minimumMinor,
        todaysTotalMinor: DEFAULT_PAYOUT_LIMITS.dailyCapMinor,
      }),
    );
    expect(result?.code).toBe('daily_cap_exceeded');
  });

  it("accepts when today's total plus the new amount exactly meets the cap", () => {
    expect(
      validatePayout(
        baseContext({
          amountMinor: DEFAULT_PAYOUT_LIMITS.minimumMinor,
          todaysTotalMinor: DEFAULT_PAYOUT_LIMITS.dailyCapMinor - DEFAULT_PAYOUT_LIMITS.minimumMinor,
        }),
      ),
    ).toBeNull();
  });

  it('rejects when the in-flight limit has been reached', () => {
    const result = validatePayout(baseContext({ inFlightCount: DEFAULT_PAYOUT_LIMITS.maxInFlight }));
    expect(result?.code).toBe('too_many_in_flight');
  });

  it('accepts when the in-flight count is one below the limit', () => {
    expect(validatePayout(baseContext({ inFlightCount: DEFAULT_PAYOUT_LIMITS.maxInFlight - 1 }))).toBeNull();
  });
});
