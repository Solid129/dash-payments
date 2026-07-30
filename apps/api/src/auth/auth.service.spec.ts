import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';

import { BankAccountsService } from '../payments/payouts/bank-accounts/bank-accounts.service';
import { DbService } from '../common/db/db.service';
import { UserRole } from '../user/user.schema';
import { UserService } from '../user/user.service';
import { TeamService } from '../user/team/team.service';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

/** A marker object standing in for the transaction handle passed to `.transaction(cb)`. */
const TX = { marker: 'tx' };

describe('AuthService', () => {
  let auth: AuthService;
  let database: { db: { transaction: jest.Mock } };
  let tokens: { issuePair: jest.Mock; rotate: jest.Mock; revoke: jest.Mock };
  let users: {
    findByEmail: jest.Mock;
    updateLastLogin: jest.Mock;
    findWithMerchant: jest.Mock;
    createMerchant: jest.Mock;
    createUser: jest.Mock;
  };
  let bankAccounts: { createPlaceholder: jest.Mock };
  let team: { findAcceptableInvitationByToken: jest.Mock; markInvitationAccepted: jest.Mock };

  const CONTEXT = { userAgent: 'jest', ipAddress: '127.0.0.1' };

  beforeEach(() => {
    database = { db: { transaction: jest.fn((cb: (tx: typeof TX) => unknown) => cb(TX)) } };
    tokens = {
      issuePair: jest.fn().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' }),
      rotate: jest.fn(),
      revoke: jest.fn(),
    };
    users = {
      findByEmail: jest.fn(),
      updateLastLogin: jest.fn().mockResolvedValue(undefined),
      findWithMerchant: jest.fn(),
      createMerchant: jest.fn(),
      createUser: jest.fn(),
    };
    bankAccounts = { createPlaceholder: jest.fn().mockResolvedValue({ id: 'bank-1' }) };
    team = { findAcceptableInvitationByToken: jest.fn(), markInvitationAccepted: jest.fn() };

    auth = new AuthService(
      database as unknown as DbService,
      tokens as unknown as TokenService,
      users as unknown as UserService,
      bankAccounts as unknown as BankAccountsService,
      team as unknown as TeamService,
    );
  });

  describe('login', () => {
    it('issues tokens for correct credentials', async () => {
      const passwordHash = await argon2.hash('correct-horse-battery', { type: argon2.argon2id });
      const user = {
        id: 'user-1',
        merchantId: 'merchant-1',
        email: 'demo@example.test',
        passwordHash,
        fullName: 'Demo User',
        role: UserRole.OWNER,
      };
      users.findByEmail.mockResolvedValue(user);
      users.findWithMerchant.mockResolvedValue({
        ...user,
        merchant: {
          id: 'merchant-1',
          businessName: 'Demo',
          country: 'IN',
          defaultCurrency: 'INR',
          supportEmail: null,
        },
      });

      const result = await auth.login(
        { email: 'demo@example.test', password: 'correct-horse-battery' },
        CONTEXT,
      );

      expect(result.accessToken).toBe('access');
      expect(users.updateLastLogin).toHaveBeenCalledWith('user-1');
    });

    it('rejects a wrong password with a generic message', async () => {
      const passwordHash = await argon2.hash('correct-horse-battery', { type: argon2.argon2id });
      users.findByEmail.mockResolvedValue({
        id: 'user-1',
        merchantId: 'merchant-1',
        email: 'demo@example.test',
        passwordHash,
      });

      await expect(
        auth.login({ email: 'demo@example.test', password: 'wrong-password' }, CONTEXT),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        auth.login({ email: 'demo@example.test', password: 'wrong-password' }, CONTEXT),
      ).rejects.toThrow('Invalid email or password.');
    });

    it('rejects an unknown email with the identical message a wrong password gets', async () => {
      users.findByEmail.mockResolvedValue(undefined);

      await expect(
        auth.login({ email: 'nobody@example.test', password: 'anything-long-enough' }, CONTEXT),
      ).rejects.toThrow('Invalid email or password.');
    });

    it('never issues tokens when authentication fails', async () => {
      users.findByEmail.mockResolvedValue(undefined);
      await expect(
        auth.login({ email: 'nobody@example.test', password: 'anything-long-enough' }, CONTEXT),
      ).rejects.toThrow(UnauthorizedException);
      expect(tokens.issuePair).not.toHaveBeenCalled();
    });
  });

  describe('signup', () => {
    it('creates the merchant, owner, and a pending bank account in one transaction', async () => {
      const callOrder: string[] = [];

      users.createMerchant.mockImplementation(async (data: Record<string, unknown>) => {
        callOrder.push('merchant');
        return { id: 'merchant-1', ...data };
      });
      users.createUser.mockImplementation(async (data: Record<string, unknown>) => {
        callOrder.push('user');
        return { id: 'user-1', ...data };
      });
      bankAccounts.createPlaceholder.mockImplementation(async () => {
        callOrder.push('bankAccount');
        return { id: 'bank-1' };
      });
      users.findWithMerchant.mockResolvedValue({
        id: 'user-1',
        merchantId: 'merchant-1',
        email: 'new@example.test',
        fullName: 'New Owner',
        role: UserRole.OWNER,
        merchant: {
          id: 'merchant-1',
          businessName: 'New Biz',
          country: 'IN',
          defaultCurrency: 'INR',
          supportEmail: null,
        },
      });

      await auth.signup(
        {
          email: 'new@example.test',
          password: 'a-long-enough-password',
          fullName: 'New Owner',
          businessName: 'New Biz',
        },
        CONTEXT,
      );

      // Order matters: a merchant with no owner, or an owner with no merchant,
      // would both be unusable states, so the owner and its placeholder
      // destination are created only once the merchant exists.
      expect(callOrder).toEqual(['merchant', 'user', 'bankAccount']);

      // All three run inside the same transaction, not three separate ones.
      expect(users.createMerchant).toHaveBeenCalledWith(expect.anything(), TX);
      expect(users.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ merchantId: 'merchant-1' }),
        TX,
      );
      expect(bankAccounts.createPlaceholder).toHaveBeenCalledWith(
        expect.objectContaining({ merchantId: 'merchant-1' }),
        TX,
      );

      // The seeded bank account starts unverified — signup alone must not grant a
      // usable payout destination. That default now lives in
      // `BankAccountsService.createPlaceholder` itself; it's covered there.
      expect(users.createUser).toHaveBeenCalledWith(expect.objectContaining({ role: 'OWNER' }), TX);
    });
  });
});
