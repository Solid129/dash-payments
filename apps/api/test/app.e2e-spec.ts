import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { and, eq, sql } from 'drizzle-orm';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { bankAccounts } from '../src/payments/payouts/bank-accounts/bank-accounts.schema';
import { DbService } from '../src/common/db/db.service';
import { findOrThrow } from '../src/common/db/query-helpers';
import { ledgerEntries } from '../src/payments/ledger/ledger.schema';
import { payouts } from '../src/payments/payouts/payouts.schema';
import { webhookEvents } from '../src/payments/payouts/psp/psp.schema';
import { transactions } from '../src/payments/transactions/transactions.schema';
import { waitUntil } from './utils';

describe('Merchant Payments API (e2e)', () => {
  let app: NestExpressApplication;
  let database: DbService;
  const port = Number(process.env.PORT ?? 3100);
  const baseUrl = `http://localhost:${port}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

    database = app.get(DbService);
    // A real listening socket — required so the mock PSP's webhook deliveries
    // (genuine HTTP requests back to this process) have somewhere to land.
    await app.listen(port);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await database.truncateAllTables();
  });

  function agent() {
    return request.agent(baseUrl);
  }

  function extractCookie(response: request.Response, name: string): string | undefined {
    const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
    return raw?.map((c) => c.split(';')[0]).find((c) => c.startsWith(`${name}=`));
  }

  async function signUpMerchant(overrides: Partial<Record<string, string>> = {}) {
    const client = agent();
    const response = await client
      .post('/api/auth/signup')
      .send({
        email: overrides.email ?? 'owner@brew.test',
        password: overrides.password ?? 'a-very-long-passphrase',
        fullName: 'Test Owner',
        businessName: 'Brew Co',
        currency: 'INR',
        country: 'IN',
      })
      .expect(201);

    return { client, profile: response.body, signupResponse: response };
  }

  /** Credits the merchant's ledger directly, standing in for a settled sale. */
  async function creditBalance(merchantId: string, amountMinor: number, currency = 'INR') {
    await database.db.insert(ledgerEntries).values({
      merchantId,
      kind: 'PAYMENT_NET',
      amountMinor,
      currency,
      state: 'AVAILABLE',
      availableAt: new Date(),
      description: 'test credit',
    });
  }

  async function verifiedBankAccount(merchantId: string, currency = 'INR') {
    const existing = findOrThrow(
      await database.db.query.bankAccounts.findFirst({ where: eq(bankAccounts.merchantId, merchantId) }),
    );
    const [updated] = await database.db
      .update(bankAccounts)
      .set({ status: 'VERIFIED', currency })
      .where(eq(bankAccounts.id, existing.id))
      .returning();
    return updated;
  }

  describe('signup, login, and session', () => {
    it('creates an account, sets cookies, and exposes the profile on /auth/me', async () => {
      const { client, profile } = await signUpMerchant();
      expect(profile.user.email).toBe('owner@brew.test');
      expect(profile.merchant.businessName).toBe('Brew Co');

      const me = await client.get('/api/auth/me').expect(200);
      expect(me.body.user.email).toBe('owner@brew.test');
    });

    it('rejects an unauthenticated request', async () => {
      await request(baseUrl).get('/api/auth/me').expect(401);
    });

    it('logs in with correct credentials and rejects incorrect ones with the same message', async () => {
      await signUpMerchant({ email: 'login-test@brew.test', password: 'a-very-long-passphrase' });

      const good = await agent()
        .post('/api/auth/login')
        .send({ email: 'login-test@brew.test', password: 'a-very-long-passphrase' })
        .expect(200);
      expect(good.body.user.email).toBe('login-test@brew.test');

      const badPassword = await agent()
        .post('/api/auth/login')
        .send({ email: 'login-test@brew.test', password: 'totally-wrong-password' })
        .expect(401);
      const badEmail = await agent()
        .post('/api/auth/login')
        .send({ email: 'nobody@brew.test', password: 'totally-wrong-password' })
        .expect(401);
      expect(badPassword.body.message).toBe(badEmail.body.message);
    });

    it('refreshes the session and rejects reuse of a rotated refresh token', async () => {
      const { client, signupResponse } = await signUpMerchant({ email: 'refresh-test@brew.test' });
      const oldRefreshCookie = extractCookie(signupResponse, 'refresh_token');

      await client.post('/api/auth/refresh').expect(200);
      // The rotated-out token must now be rejected — presenting it again looks
      // like theft, not a legitimate retry.
      const reuse = await request(baseUrl)
        .post('/api/auth/refresh')
        .set('Cookie', oldRefreshCookie!)
        .expect(401);
      expect(reuse.body.statusCode).toBe(401);
    });

    it('clears cookies and revokes the session on logout', async () => {
      const { client } = await signUpMerchant({ email: 'logout-test@brew.test' });
      await client.post('/api/auth/logout').expect(200);
      await client.get('/api/auth/me').expect(401);
    });
  });

  describe('tenant isolation', () => {
    it("returns 404, not 403, for another merchant's transaction", async () => {
      const { client: clientA, profile: profileA } = await signUpMerchant({ email: 'a@brew.test' });
      const { client: clientB } = await signUpMerchant({ email: 'b@brew.test' });

      await creditBalance(profileA.merchant.id, 500_00);
      const [txn] = await database.db
        .insert(transactions)
        .values({
          merchantId: profileA.merchant.id,
          reference: 'txn_isolation_test',
          type: 'PAYMENT',
          status: 'SUCCEEDED',
          amountMinor: 500_00,
          feeMinor: 0,
          netMinor: 500_00,
          currency: 'INR',
          method: 'CARD',
        })
        .returning();

      await clientA.get(`/api/transactions/${txn.id}`).expect(200);
      await clientB.get(`/api/transactions/${txn.id}`).expect(404);
    });
  });

  describe('payouts: validation', () => {
    it('rejects a payout above the available balance with a field error', async () => {
      const { client, profile } = await signUpMerchant({ email: 'balance-test@brew.test' });
      const bankAccount = await verifiedBankAccount(profile.merchant.id);
      await creditBalance(profile.merchant.id, 100_00);

      const response = await client
        .post('/api/payouts')
        .send({ amountMinor: 100_000_00, currency: 'INR', bankAccountId: bankAccount.id })
        .expect(400);

      expect(response.body.fieldErrors).toHaveProperty('amountMinor');
    });

    it('rejects a payout to an unverified destination', async () => {
      const { client, profile } = await signUpMerchant({ email: 'unverified-test@brew.test' });
      await creditBalance(profile.merchant.id, 100_000_00);
      const pendingAccount = findOrThrow(
        await database.db.query.bankAccounts.findFirst({
          where: eq(bankAccounts.merchantId, profile.merchant.id),
        }),
      );

      const response = await client
        .post('/api/payouts')
        .send({ amountMinor: 50_000, currency: 'INR', bankAccountId: pendingAccount.id })
        .expect(400);

      expect(response.body.fieldErrors).toHaveProperty('bankAccountId');
    });
  });

  describe('payouts: async lifecycle', () => {
    it('accepts (202) and reserves the balance immediately, then reaches PAID via webhooks', async () => {
      const { client, profile } = await signUpMerchant({ email: 'lifecycle-test@brew.test' });
      const bankAccount = await verifiedBankAccount(profile.merchant.id);
      await creditBalance(profile.merchant.id, 100_000_00);

      const create = await client
        .post('/api/payouts')
        .send({ amountMinor: 25_000_00, currency: 'INR', bankAccountId: bankAccount.id })
        .expect(202);

      expect(create.body.status).toBe('PENDING');

      const afterAccept = await client.get('/api/dashboard/summary').expect(200);
      expect(afterAccept.body.balance.availableMinor).toBe(100_000_00 - 25_000_00);

      const payoutId = create.body.id;
      await waitUntil(
        async () => {
          const res = await client.get(`/api/payouts/${payoutId}`);
          return res.body.status === 'PAID' ? res.body : null;
        },
        { description: 'payout to reach PAID via webhook delivery' },
      );

      const finalBalance = await client.get('/api/dashboard/summary').expect(200);
      // PAID doesn't touch the ledger again — the debit posted at accept time
      // already reflects the payout.
      expect(finalBalance.body.balance.availableMinor).toBe(100_000_00 - 25_000_00);
    }, 10_000);

    it('restores the reserved balance when a payout fails', async () => {
      const { client, profile } = await signUpMerchant({ email: 'failure-test@brew.test' });
      const bankAccount = await verifiedBankAccount(profile.merchant.id);
      await creditBalance(profile.merchant.id, 100_000_00);

      const create = await client
        .post('/api/payouts')
        .send({ amountMinor: 10_000_00, currency: 'INR', bankAccountId: bankAccount.id })
        .expect(202);

      await client
        .post(`/api/payouts/${create.body.id}/simulate`)
        .send({ event: 'failed', failureCode: 'account_details_invalid' })
        .expect(200);

      await waitUntil(async () => {
        const res = await client.get(`/api/payouts/${create.body.id}`);
        return res.body.status === 'FAILED' ? res.body : null;
      });

      const balance = await client.get('/api/dashboard/summary').expect(200);
      // Reserved, then fully returned — the net effect of a failed payout on the
      // available balance must be zero.
      expect(balance.body.balance.availableMinor).toBe(100_000_00);

      const [{ count: ledgerRows }] = await database.db
        .select({ count: sql<number>`count(*)::int` })
        .from(ledgerEntries)
        .where(
          and(eq(ledgerEntries.merchantId, profile.merchant.id), eq(ledgerEntries.kind, 'PAYOUT_REVERSAL')),
        );
      expect(ledgerRows).toBe(1);
    }, 10_000);

    it('honours the Idempotency-Key header instead of creating a second payout', async () => {
      const { client, profile } = await signUpMerchant({ email: 'idempotency-test@brew.test' });
      const bankAccount = await verifiedBankAccount(profile.merchant.id);
      await creditBalance(profile.merchant.id, 100_000_00);

      const idempotencyKey = 'client-generated-key-123';
      const first = await client
        .post('/api/payouts')
        .set('Idempotency-Key', idempotencyKey)
        .send({ amountMinor: 5_000_00, currency: 'INR', bankAccountId: bankAccount.id })
        .expect(202);

      const second = await client
        .post('/api/payouts')
        .set('Idempotency-Key', idempotencyKey)
        .send({ amountMinor: 5_000_00, currency: 'INR', bankAccountId: bankAccount.id })
        .expect(202);

      expect(second.body.id).toBe(first.body.id);

      const [{ count }] = await database.db
        .select({ count: sql<number>`count(*)::int` })
        .from(payouts)
        .where(eq(payouts.merchantId, profile.merchant.id));
      expect(count).toBe(1);
    });
  });

  describe('webhook hardening', () => {
    it('rejects a delivery with no signature header', async () => {
      await request(baseUrl)
        .post('/api/webhooks/payouts')
        .send({ id: 'evt_x', type: 'payout.paid', createdAt: new Date().toISOString(), data: {} })
        .expect(401);
    });

    it('ignores a duplicate delivery of an already-applied event without a second ledger write', async () => {
      const { client, profile } = await signUpMerchant({ email: 'replay-test@brew.test' });
      const bankAccount = await verifiedBankAccount(profile.merchant.id);
      await creditBalance(profile.merchant.id, 100_000_00);

      const create = await client
        .post('/api/payouts')
        .send({ amountMinor: 5_000_00, currency: 'INR', bankAccountId: bankAccount.id })
        .expect(202);

      await client.post(`/api/payouts/${create.body.id}/simulate`).send({ event: 'failed' }).expect(200);

      await waitUntil(async () => {
        const res = await client.get(`/api/payouts/${create.body.id}`);
        return res.body.status === 'FAILED' ? res.body : null;
      });

      const appliedEvent = findOrThrow(
        await database.db.query.webhookEvents.findFirst({
          where: and(eq(webhookEvents.payoutId, create.body.id), eq(webhookEvents.outcome, 'APPLIED')),
        }),
      );

      const balanceBeforeReplay = await client.get('/api/dashboard/summary').expect(200);

      // Replay the exact same event id with a validly signed request.
      const { signPayload } = await import('../src/payments/payouts/psp/webhook-signature');
      const rawBody = JSON.stringify(appliedEvent.payload);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signPayload(rawBody, process.env.PSP_WEBHOOK_SECRET!, timestamp);

      const replay = await request(baseUrl)
        .post('/api/webhooks/payouts')
        .set('content-type', 'application/json')
        .set('x-psp-signature', signature)
        .send(JSON.parse(rawBody))
        .expect(200);
      expect(replay.body.outcome).toBe('DUPLICATE');

      const balanceAfterReplay = await client.get('/api/dashboard/summary').expect(200);
      expect(balanceAfterReplay.body.balance.availableMinor).toBe(
        balanceBeforeReplay.body.balance.availableMinor,
      );

      const [{ count: reversalCount }] = await database.db
        .select({ count: sql<number>`count(*)::int` })
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.payoutId, create.body.id), eq(ledgerEntries.kind, 'PAYOUT_REVERSAL')));
      expect(reversalCount).toBe(1);
    }, 10_000);
  });

  describe('report subscriptions', () => {
    it('defaults to OFF, can be changed, and reflects the change back', async () => {
      const { client } = await signUpMerchant({ email: 'reports-test@brew.test' });

      const initial = await client.get('/api/reports/subscription').expect(200);
      expect(initial.body).toEqual({ frequency: 'OFF', lastSentAt: null });

      const updated = await client.put('/api/reports/subscription').send({ frequency: 'WEEKLY' }).expect(200);
      expect(updated.body.frequency).toBe('WEEKLY');

      const refetched = await client.get('/api/reports/subscription').expect(200);
      expect(refetched.body.frequency).toBe('WEEKLY');
    });

    it('rejects an invalid frequency', async () => {
      const { client } = await signUpMerchant({ email: 'reports-invalid@brew.test' });

      await client.put('/api/reports/subscription').send({ frequency: 'DAILY' }).expect(400);
    });

    it('send-now returns the consolidated report content and stamps lastSentAt once enabled', async () => {
      const { client, profile } = await signUpMerchant({ email: 'reports-send-now@brew.test' });
      await creditBalance(profile.merchant.id, 100_000_00);

      // OFF: previews without marking anything sent.
      const preview = await client.post('/api/reports/subscription/send-now').expect(200);
      expect(preview.body.frequency).toBe('WEEKLY');
      expect(preview.body.payload.businessName).toBe('Brew Co');
      expect(preview.body.payload.summary.balance.availableMinor).toBe(100_000_00);
      expect((await client.get('/api/reports/subscription').expect(200)).body.lastSentAt).toBeNull();

      // Enabled: a real send stamps lastSentAt.
      await client.put('/api/reports/subscription').send({ frequency: 'MONTHLY' }).expect(200);
      const sent = await client.post('/api/reports/subscription/send-now').expect(200);
      expect(sent.body.frequency).toBe('MONTHLY');

      const after = await client.get('/api/reports/subscription').expect(200);
      expect(after.body.lastSentAt).not.toBeNull();
    });
  });
});
