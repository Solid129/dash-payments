/* eslint-disable no-console */
/**
 * Deterministic seed.
 *
 * Goals, in priority order:
 *
 *  1. **Internally consistent.** The ledger is generated *from* the transactions
 *     and payouts, never independently, so the balance the dashboard shows is
 *     genuinely the sum of the activity below it. A failed payout gets its
 *     compensating reversal, exactly as the live webhook path would write it.
 *  2. **Realistic shape.** Weekday/business-hours seasonality, a believable
 *     status mix, method weighting, fees that match the fee function the app
 *     uses at runtime. A flat random scatter makes charts look fake.
 *  3. **Reproducible.** A fixed faker seed and a fixed "now" mean the numbers
 *     don't move between runs, so screenshots and tests stay valid.
 *  4. **Demonstrates every state.** Both verified and unverified bank accounts,
 *     and payouts in all four statuses, so a reviewer can see the async states
 *     and trigger the validation rules without setting anything up.
 */

import { faker } from '@faker-js/faker';
import * as argon2 from 'argon2';
import { config } from 'dotenv';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { calculateFee } from '../src/common/money';
import { payoutReference, pspReference, transactionReference } from '../src/common/reference';
import { BankAccountStatus, bankAccounts } from '../src/payments/payouts/bank-accounts/bank-accounts.schema';
import { invitations } from '../src/user/team/team.schema';
import { merchants, refreshTokens, users, UserRole } from '../src/user/user.schema';
import { LedgerEntryKind, LedgerEntryState, ledgerEntries } from '../src/payments/ledger/ledger.schema';
import { PayoutStatus, payouts } from '../src/payments/payouts/payouts.schema';
import { webhookEvents } from '../src/payments/payouts/psp/psp.schema';
import {
  customers,
  PaymentMethod,
  transactionEvents,
  TransactionStatus,
  transactions,
  TransactionType,
} from '../src/payments/transactions/transactions.schema';

config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set.');
}
const client = postgres(connectionString);
const db = drizzle(client);

const SEED = 20260729;
const DAYS_OF_HISTORY = 120;
const CUSTOMERS_PER_MERCHANT = 45;
const TRANSACTIONS_PER_MERCHANT = 800;

/** Funds settle T+2; anything newer than this is still PENDING in the ledger. */
const SETTLEMENT_DELAY_DAYS = 2;

const DEMO_PASSWORD = 'Password123!';

// Anchored so re-seeding produces the same relative history.
const NOW = new Date('2026-07-29T10:00:00.000Z');

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

/** Pick from `[value, weight]` pairs. */
function weighted<T>(options: Array<[T, number]>): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = faker.number.float({ min: 0, max: total });
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return options[options.length - 1][0];
}

/**
 * A timestamp `dayOffset` days ago, at an hour that looks like real trading:
 * a late-morning peak and an evening peak, nothing much overnight.
 */
function tradingTimestamp(dayOffset: number): Date {
  const date = daysAgo(dayOffset);
  const hour = weighted<number>([
    [9, 3], [10, 6], [11, 8], [12, 7], [13, 6], [14, 5],
    [15, 5], [16, 6], [17, 7], [18, 8], [19, 9], [20, 7],
    [21, 4], [22, 2], [8, 2], [7, 1], [23, 1], [2, 1],
  ]);
  date.setUTCHours(hour, faker.number.int({ min: 0, max: 59 }), faker.number.int({ min: 0, max: 59 }), 0);
  return date;
}

/** Weekends run at roughly 60% of a weekday for a coffee business. */
function dayVolumeMultiplier(date: Date): number {
  const day = date.getUTCDay();
  if (day === 0) return 0.55;
  if (day === 6) return 0.7;
  if (day === 5) return 1.15;
  return 1;
}

const CARD_BRANDS = ['Visa', 'Mastercard', 'RuPay', 'Amex'];

const FAILURE_MODES: Array<{ code: string; reason: string }> = [
  { code: 'insufficient_funds', reason: 'The card was declined for insufficient funds.' },
  { code: 'card_declined', reason: 'The issuing bank declined the payment.' },
  { code: 'expired_card', reason: 'The card has expired.' },
  { code: 'authentication_failed', reason: 'The customer did not complete 3-D Secure authentication.' },
  { code: 'processing_error', reason: 'An error occurred while processing the payment. Ask the customer to retry.' },
];

const PAYOUT_FAILURE = {
  code: 'account_details_invalid',
  reason: 'The bank rejected the transfer: account details could not be verified.',
};

interface MerchantSpec {
  businessName: string;
  legalName: string;
  country: string;
  currency: string;
  supportEmail: string;
  owner: { email: string; fullName: string };
  /** Extra logins demonstrating the ACCOUNTANT/SUPPORT roles without going
   *  through the invite flow first. */
  teammates?: Array<{ email: string; fullName: string; role: UserRole }>;
  bankAccounts: Array<{
    label: string;
    bankName: string;
    accountHolderName: string;
    status: BankAccountStatus;
    isDefault: boolean;
  }>;
}

const MERCHANTS: MerchantSpec[] = [
  {
    businessName: 'Northwind Coffee',
    legalName: 'Northwind Coffee Roasters Pvt Ltd',
    country: 'IN',
    currency: 'INR',
    supportEmail: 'support@northwindcoffee.test',
    owner: { email: 'demo@northwindcoffee.test', fullName: 'Asha Raghavan' },
    teammates: [
      { email: 'ops@northwindcoffee.test', fullName: 'Priya Nair', role: UserRole.ACCOUNTANT },
      { email: 'support@northwindcoffee.test', fullName: 'Karan Bhatt', role: UserRole.SUPPORT },
    ],
    bankAccounts: [
      {
        label: 'Primary settlement account',
        bankName: 'HDFC Bank',
        accountHolderName: 'Northwind Coffee Roasters Pvt Ltd',
        status: BankAccountStatus.VERIFIED,
        isDefault: true,
      },
      {
        // Deliberately unverified: this is what makes the "destination must be
        // verified" payout rule demonstrable from the UI.
        label: 'New current account (verification pending)',
        bankName: 'ICICI Bank',
        accountHolderName: 'Northwind Coffee Roasters Pvt Ltd',
        status: BankAccountStatus.PENDING,
        isDefault: false,
      },
    ],
  },
  {
    // A second tenant. Nothing in the UI links to it; it exists so that tenant
    // isolation is something you can actually test rather than assume.
    businessName: 'Tidepool Studio',
    legalName: 'Tidepool Studio LLP',
    country: 'IN',
    currency: 'INR',
    supportEmail: 'hello@tidepoolstudio.test',
    owner: { email: 'owner@tidepoolstudio.test', fullName: 'Rohan Mehta' },
    bankAccounts: [
      {
        label: 'Business account',
        bankName: 'Axis Bank',
        accountHolderName: 'Tidepool Studio LLP',
        status: BankAccountStatus.VERIFIED,
        isDefault: true,
      },
    ],
  },
];

const PRODUCTS = [
  'Single-origin subscription', 'Espresso blend 1kg', 'Filter coffee 500g', 'Cold brew 6-pack',
  'Barista starter kit', 'Ceramic pour-over set', 'Gift card', 'Tasting flight booking',
  'Wholesale order', 'Latte art workshop',
];

interface PaymentRow {
  id: string;
  merchantId: string;
  customerId: string;
  reference: string;
  type: TransactionType;
  status: TransactionStatus;
  amountMinor: number;
  feeMinor: number;
  netMinor: number;
  currency: string;
  method: PaymentMethod;
  cardBrand: string | null;
  last4: string | null;
  description: string;
  parentTransactionId?: string;
  failureCode: string | null;
  failureReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  settledAt: Date | null;
}

async function main() {
  faker.seed(SEED);

  console.log('Clearing existing data…');
  // Order matters: children before parents. Truncating in one statement with
  // CASCADE would be faster but would also silently wipe anything added later,
  // so the deletes stay explicit.
  await db.delete(webhookEvents);
  await db.delete(ledgerEntries);
  await db.delete(transactionEvents);
  await db.delete(payouts);
  await db.delete(transactions);
  await db.delete(bankAccounts);
  await db.delete(customers);
  await db.delete(refreshTokens);
  await db.delete(invitations);
  await db.delete(users);
  await db.delete(merchants);

  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });

  for (const spec of MERCHANTS) {
    console.log(`Seeding ${spec.businessName}…`);

    const [merchant] = await db
      .insert(merchants)
      .values({
        businessName: spec.businessName,
        legalName: spec.legalName,
        country: spec.country,
        defaultCurrency: spec.currency,
        supportEmail: spec.supportEmail,
        createdAt: daysAgo(DAYS_OF_HISTORY + 15),
      })
      .returning();

    const [owner] = await db
      .insert(users)
      .values({
        merchantId: merchant.id,
        email: spec.owner.email,
        fullName: spec.owner.fullName,
        passwordHash,
        role: UserRole.OWNER,
        lastLoginAt: daysAgo(0),
        createdAt: daysAgo(DAYS_OF_HISTORY + 15),
      })
      .returning();

    // Extra logins so the ACCOUNTANT/SUPPORT roles are demoable immediately,
    // without first walking through the invite flow.
    if (spec.teammates?.length) {
      await db.insert(users).values(
        spec.teammates.map((teammate) => ({
          merchantId: merchant.id,
          email: teammate.email,
          fullName: teammate.fullName,
          passwordHash,
          role: teammate.role,
          lastLoginAt: daysAgo(faker.number.int({ min: 0, max: 5 })),
          createdAt: daysAgo(DAYS_OF_HISTORY),
        })),
      );

      // One pending invitation too, so the Team page has something to show
      // beyond the members who already joined.
      await db.insert(invitations).values({
        merchantId: merchant.id,
        email: 'finance-contractor@northwindcoffee.test',
        role: UserRole.ACCOUNTANT,
        // A random, never-presented hash — this fixture is for display on
        // the Team page, not for actually being accepted.
        tokenHash: faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' }),
        invitedByUserId: owner.id,
        expiresAt: new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000),
        createdAt: daysAgo(1),
      });
    }

    const seededBankAccounts = await Promise.all(
      spec.bankAccounts.map(async (account) => {
        const [row] = await db
          .insert(bankAccounts)
          .values({
            merchantId: merchant.id,
            label: account.label,
            bankName: account.bankName,
            accountHolderName: account.accountHolderName,
            last4: faker.string.numeric(4),
            routingCode: `${faker.string.alpha({ length: 4, casing: 'upper' })}0${faker.string.numeric(6)}`,
            currency: spec.currency,
            status: account.status,
            isDefault: account.isDefault,
            createdAt: daysAgo(DAYS_OF_HISTORY + 10),
          })
          .returning();
        return row;
      }),
    );
    const verifiedAccount = seededBankAccounts.find((a) => a.status === BankAccountStatus.VERIFIED)!;

    // ---------------------------------------------------------------------
    // Customers
    // ---------------------------------------------------------------------
    const customerCount = spec === MERCHANTS[0] ? CUSTOMERS_PER_MERCHANT : 12;
    const seededCustomers = await Promise.all(
      Array.from({ length: customerCount }).map(async () => {
        const name = faker.person.fullName();
        const [row] = await db
          .insert(customers)
          .values({
            merchantId: merchant.id,
            name,
            email: faker.internet
              .email({ firstName: name.split(' ')[0], lastName: name.split(' ').pop() })
              .toLowerCase(),
            country: faker.helpers.arrayElement(['IN', 'IN', 'IN', 'US', 'GB', 'AE']),
            createdAt: daysAgo(faker.number.int({ min: 0, max: DAYS_OF_HISTORY })),
          })
          .returning();
        return row;
      }),
    );

    // ---------------------------------------------------------------------
    // Transactions
    //
    // Built in memory first so refunds can reference already-created payments
    // and the ledger can be derived from the final set in one pass.
    // ---------------------------------------------------------------------
    const targetCount = spec === MERCHANTS[0] ? TRANSACTIONS_PER_MERCHANT : 60;

    const payments: PaymentRow[] = [];

    for (let i = 0; i < targetCount; i += 1) {
      const dayOffset = faker.number.int({ min: 0, max: DAYS_OF_HISTORY });
      const createdAt = tradingTimestamp(dayOffset);

      // Seasonality: skip some entries on slower days rather than scaling
      // amounts, which keeps individual sales realistic and thins the volume.
      if (faker.number.float({ min: 0, max: 1 }) > dayVolumeMultiplier(createdAt)) continue;

      const status = weighted<TransactionStatus>([
        [TransactionStatus.SUCCEEDED, 89],
        [TransactionStatus.PENDING, 4],
        [TransactionStatus.FAILED, 6],
      ]);

      const method = weighted<PaymentMethod>([
        [PaymentMethod.CARD, 52],
        [PaymentMethod.UPI, 33],
        [PaymentMethod.WALLET, 9],
        [PaymentMethod.BANK_TRANSFER, 6],
      ]);

      // Mostly small retail baskets, occasionally a wholesale order.
      const amountMinor = weighted<() => number>([
        [() => faker.number.int({ min: 18_000, max: 90_000 }), 70],
        [() => faker.number.int({ min: 90_000, max: 350_000 }), 25],
        [() => faker.number.int({ min: 350_000, max: 1_400_000 }), 5],
      ])();

      const isCard = method === PaymentMethod.CARD;
      const isSuccess = status === TransactionStatus.SUCCEEDED;
      const failure = isSuccess || status === TransactionStatus.PENDING
        ? null
        : faker.helpers.arrayElement(FAILURE_MODES);

      // Fees are only charged on money that actually moved.
      const feeMinor = isSuccess ? calculateFee(amountMinor) : 0;

      payments.push({
        id: faker.string.uuid(),
        merchantId: merchant.id,
        customerId: faker.helpers.arrayElement(seededCustomers).id,
        reference: transactionReference(),
        type: TransactionType.PAYMENT,
        status,
        amountMinor,
        feeMinor,
        netMinor: amountMinor - feeMinor,
        currency: spec.currency,
        method,
        cardBrand: isCard ? faker.helpers.arrayElement(CARD_BRANDS) : null,
        last4: isCard ? faker.string.numeric(4) : null,
        description: faker.helpers.arrayElement(PRODUCTS),
        failureCode: failure?.code ?? null,
        failureReason: failure?.reason ?? null,
        metadata: {
          channel: faker.helpers.arrayElement(['online', 'in_store', 'in_store', 'invoice']),
          orderId: `ord_${faker.string.alphanumeric({ length: 8, casing: 'lower' })}`,
        },
        createdAt,
        settledAt: isSuccess ? new Date(createdAt.getTime() + 36 * 60 * 60 * 1000) : null,
      });
    }

    // Refund ~3% of settled payments, and mark the parent accordingly.
    const refundable = payments.filter(
      (p) => p.status === TransactionStatus.SUCCEEDED && p.createdAt > daysAgo(DAYS_OF_HISTORY - 5),
    );
    const refundTargets = faker.helpers.arrayElements(
      refundable,
      Math.max(1, Math.round(refundable.length * 0.03)),
    );

    const refunds: PaymentRow[] = [];
    for (const parent of refundTargets) {
      // Some refunds are partial, which is why the parent has its own status.
      const isPartial = faker.number.float({ min: 0, max: 1 }) < 0.35;
      const refundAmount = isPartial
        ? Math.round(parent.amountMinor * faker.number.float({ min: 0.2, max: 0.6 }))
        : parent.amountMinor;

      const parentCreatedAt = parent.createdAt;
      const refundedAt = new Date(
        parentCreatedAt.getTime() + faker.number.int({ min: 2, max: 10 }) * 24 * 60 * 60 * 1000,
      );
      if (refundedAt > NOW) continue;

      parent.status = isPartial
        ? TransactionStatus.PARTIALLY_REFUNDED
        : TransactionStatus.REFUNDED;

      refunds.push({
        id: faker.string.uuid(),
        merchantId: merchant.id,
        customerId: parent.customerId,
        reference: transactionReference(),
        type: TransactionType.REFUND,
        status: TransactionStatus.SUCCEEDED,
        // A refund is stored as a positive amount with type REFUND; the sign
        // lives in the ledger, so the list can show "₹500 refunded" plainly.
        amountMinor: refundAmount,
        feeMinor: 0,
        netMinor: refundAmount,
        currency: spec.currency,
        method: parent.method,
        cardBrand: parent.cardBrand,
        last4: parent.last4,
        description: `Refund for ${parent.reference}`,
        parentTransactionId: parent.id,
        failureCode: null,
        failureReason: null,
        metadata: { reason: faker.helpers.arrayElement(['requested_by_customer', 'damaged_goods', 'duplicate']) },
        createdAt: refundedAt,
        settledAt: refundedAt,
      });
    }

    const allTransactions = [...payments, ...refunds];
    if (allTransactions.length > 0) {
      await db.insert(transactions).values(allTransactions);
    }
    console.log(`  ${payments.length} payments, ${refunds.length} refunds`);

    // Timeline events, so the detail page has a real history to render.
    const events: Array<{ transactionId: string; type: string; message: string; createdAt: Date }> = [];
    for (const txn of allTransactions) {
      const createdAt = txn.createdAt;
      const push = (offsetSeconds: number, type: string, message: string) =>
        events.push({
          transactionId: txn.id,
          type,
          message,
          createdAt: new Date(createdAt.getTime() + offsetSeconds * 1000),
        });

      if (txn.type === TransactionType.REFUND) {
        push(0, 'refund.created', 'Refund requested by the merchant.');
        push(4, 'refund.succeeded', 'Refund issued to the original payment method.');
        continue;
      }

      push(0, 'payment.created', 'Payment intent created.');
      push(2, 'payment.authorized', 'Authorization approved by the issuer.');

      if (txn.status === TransactionStatus.FAILED) {
        events.pop(); // never authorized
        push(3, 'payment.failed', txn.failureReason as string);
      } else if (txn.status === TransactionStatus.PENDING) {
        push(3, 'payment.processing', 'Awaiting confirmation from the payment method.');
      } else {
        push(4, 'payment.captured', 'Funds captured.');
        push(36 * 60 * 60, 'payment.settled', 'Funds settled and added to your balance.');
        if (txn.status === TransactionStatus.REFUNDED) {
          push(36 * 60 * 60 + 60, 'payment.refunded', 'Payment fully refunded.');
        } else if (txn.status === TransactionStatus.PARTIALLY_REFUNDED) {
          push(36 * 60 * 60 + 60, 'payment.partially_refunded', 'Payment partially refunded.');
        }
      }
    }
    if (events.length > 0) {
      await db.insert(transactionEvents).values(events);
    }

    // Persist the refund-driven parent status changes.
    for (const parent of refundTargets) {
      await db.update(transactions).set({ status: parent.status }).where(eq(transactions.id, parent.id));
    }

    // ---------------------------------------------------------------------
    // Ledger, derived from the transactions above
    // ---------------------------------------------------------------------
    const ledger: Array<{
      merchantId: string;
      kind: LedgerEntryKind;
      amountMinor: number;
      currency: string;
      state: LedgerEntryState;
      availableAt: Date;
      transactionId?: string;
      payoutId?: string;
      description: string;
      createdAt: Date;
    }> = [];
    const settlementCutoff = daysAgo(SETTLEMENT_DELAY_DAYS);

    for (const txn of allTransactions) {
      const createdAt = txn.createdAt;

      if (txn.type === TransactionType.REFUND) {
        // A refund debits the merchant, and is immediately available (it comes
        // straight out of the balance rather than waiting to settle).
        ledger.push({
          merchantId: merchant.id,
          kind: LedgerEntryKind.REFUND,
          amountMinor: -txn.amountMinor,
          currency: spec.currency,
          state: LedgerEntryState.AVAILABLE,
          availableAt: createdAt,
          transactionId: txn.id,
          description: `Refund ${txn.reference}`,
          createdAt,
        });
        continue;
      }

      // Only successful payments touch the balance at all. A PENDING payment
      // hasn't earned anything yet; a FAILED one never will.
      if (txn.status === TransactionStatus.FAILED || txn.status === TransactionStatus.PENDING) {
        continue;
      }

      const settledAt = txn.settledAt as Date;
      const hasSettled = settledAt <= settlementCutoff;

      ledger.push({
        merchantId: merchant.id,
        kind: LedgerEntryKind.PAYMENT_NET,
        amountMinor: txn.netMinor,
        currency: spec.currency,
        // Recent successful payments are still in transit, which is why the
        // dashboard's "pending" tile is non-zero out of the box.
        state: hasSettled ? LedgerEntryState.AVAILABLE : LedgerEntryState.PENDING,
        availableAt: settledAt,
        transactionId: txn.id,
        description: `Net settlement for ${txn.reference}`,
        createdAt,
      });
    }

    if (ledger.length > 0) {
      await db.insert(ledgerEntries).values(ledger);
    }

    // ---------------------------------------------------------------------
    // Payout history
    //
    // Every status is represented, including a FAILED payout with its
    // compensating reversal — the same pair of rows the webhook handler writes
    // at runtime, so the seeded history is indistinguishable from live activity.
    // ---------------------------------------------------------------------
    const availableSoFar = ledger
      .filter((e) => e.state === LedgerEntryState.AVAILABLE)
      .reduce((sum, e) => sum + e.amountMinor, 0);

    // Leave a healthy balance behind so a reviewer can actually make a payout.
    const payoutBudget = Math.floor(availableSoFar * 0.55);
    const historicCount = spec === MERCHANTS[0] ? 9 : 3;

    const payoutPlan: Array<{ status: PayoutStatus; dayOffset: number }> = [];
    const settledCount = historicCount - 2;
    for (let i = 0; i < settledCount; i += 1) {
      // Spread evenly from ~110 days ago up to ~2 weeks ago, so the payout
      // history sits inside the transaction history that funded it.
      const oldest = DAYS_OF_HISTORY - 10;
      const newest = 14;
      payoutPlan.push({
        status: PayoutStatus.PAID,
        dayOffset: Math.round(oldest - (i * (oldest - newest)) / Math.max(settledCount - 1, 1)),
      });
    }
    if (spec === MERCHANTS[0]) {
      // Recent and visible on the first page of the payouts list.
      payoutPlan.push({ status: PayoutStatus.FAILED, dayOffset: 6 });
      payoutPlan.push({ status: PayoutStatus.PROCESSING, dayOffset: 0 });
    } else {
      payoutPlan.push({ status: PayoutStatus.PAID, dayOffset: 12 });
      payoutPlan.push({ status: PayoutStatus.PENDING, dayOffset: 0 });
    }

    const perPayout = Math.floor(payoutBudget / Math.max(payoutPlan.length, 1));

    for (const plan of payoutPlan) {
      // Round to whole major units — real payouts are rarely to the paisa.
      const amountMinor = Math.max(
        100_00,
        Math.round((perPayout * faker.number.float({ min: 0.7, max: 1.2 })) / 100) * 100,
      );

      const createdAt = tradingTimestamp(Math.max(plan.dayOffset, 0));
      const processingAt =
        plan.status === PayoutStatus.PENDING ? null : new Date(createdAt.getTime() + 3_000);
      const paidAt =
        plan.status === PayoutStatus.PAID
          ? new Date(createdAt.getTime() + 2 * 24 * 60 * 60 * 1000)
          : null;
      const failedAt =
        plan.status === PayoutStatus.FAILED
          ? new Date(createdAt.getTime() + 20 * 60 * 60 * 1000)
          : null;

      const [payout] = await db
        .insert(payouts)
        .values({
          merchantId: merchant.id,
          bankAccountId: verifiedAccount.id,
          reference: payoutReference(),
          amountMinor,
          currency: spec.currency,
          status: plan.status,
          initiatedByUserId: owner.id,
          pspReference: pspReference(),
          estimatedArrivalAt: new Date(createdAt.getTime() + 2 * 24 * 60 * 60 * 1000),
          processingAt,
          paidAt,
          failedAt,
          failureCode: plan.status === PayoutStatus.FAILED ? PAYOUT_FAILURE.code : null,
          failureReason: plan.status === PayoutStatus.FAILED ? PAYOUT_FAILURE.reason : null,
          createdAt,
        })
        .returning();

      // The debit is written when the payout is accepted, regardless of how it
      // later turns out — the funds are committed the moment we take the request.
      await db.insert(ledgerEntries).values({
        merchantId: merchant.id,
        kind: LedgerEntryKind.PAYOUT,
        amountMinor: -amountMinor,
        currency: spec.currency,
        state: LedgerEntryState.AVAILABLE,
        availableAt: createdAt,
        payoutId: payout.id,
        description: `Payout ${payout.reference} to ${verifiedAccount.bankName} ••${verifiedAccount.last4}`,
        createdAt,
      });

      // …and a failure returns them by appending the opposite entry, never by
      // deleting the debit.
      if (plan.status === PayoutStatus.FAILED) {
        await db.insert(ledgerEntries).values({
          merchantId: merchant.id,
          kind: LedgerEntryKind.PAYOUT_REVERSAL,
          amountMinor,
          currency: spec.currency,
          state: LedgerEntryState.AVAILABLE,
          availableAt: failedAt!,
          payoutId: payout.id,
          description: `Reversal of failed payout ${payout.reference}`,
          createdAt: failedAt!,
        });
      }
    }

    const balance = await db.execute<{ state: LedgerEntryState; sum: number }>(sql`
      SELECT state, COALESCE(SUM("amountMinor"), 0)::int AS sum
      FROM ledger_entries
      WHERE "merchantId" = ${merchant.id}::uuid
      GROUP BY state
    `);
    console.log(
      `  ${payoutPlan.length} payouts · balance ${balance
        .map((b) => `${b.state}=${(b.sum / 100).toFixed(2)}`)
        .join(' ')}`,
    );
  }

  console.log('\nDone. Sign in with:');
  console.log(`  ${MERCHANTS[0].owner.email} / ${DEMO_PASSWORD}  (OWNER)`);
  for (const teammate of MERCHANTS[0].teammates ?? []) {
    console.log(`  ${teammate.email} / ${DEMO_PASSWORD}  (${teammate.role})`);
  }
  console.log(`  (second tenant, for isolation checks: ${MERCHANTS[1].owner.email} / ${DEMO_PASSWORD})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => client.end());
