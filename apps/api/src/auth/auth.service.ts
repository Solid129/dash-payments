import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';

import { hashToken } from '../common/crypto';
import { DbService } from '../common/db/db.service';
import { findOrThrow } from '../common/db/query-helpers';
import { BankAccountsService } from '../payments/payouts/bank-accounts/bank-accounts.service';
import { TeamService } from '../user/team/team.service';
import { merchants, users } from '../user/user.schema';
import type { UserRole } from '../user/user.schema';
import { UserService } from '../user/user.service';
import { AcceptInviteDto, LoginDto, SignupDto } from './dto/auth.dto';
import { TokenPair, TokenService } from './token.service';

type UserRow = typeof users.$inferSelect;
type MerchantRow = typeof merchants.$inferSelect;

/**
 * A dummy argon2 hash of a random string, used to spend the same CPU time on a
 * login attempt for an email that doesn't exist as for one that does. Without
 * this, response latency alone reveals which addresses have accounts.
 */
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHR2YWx1ZXM$RdescudvJCsgt3ub+b+dWRWJTmaaJObG';

export interface AuthenticatedProfile {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    lastLoginAt: Date | null;
  };
  merchant: {
    id: string;
    businessName: string;
    country: string;
    defaultCurrency: string;
    supportEmail: string | null;
  };
}

interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly database: DbService,
    private readonly tokens: TokenService,
    private readonly users: UserService,
    private readonly bankAccounts: BankAccountsService,
    private readonly team: TeamService,
  ) {}

  /**
   * argon2id: memory-hard, so a leaked hash is expensive to attack on GPUs in a
   * way bcrypt is not. Parameters follow the OWASP recommendation (19 MiB, 2
   * iterations, parallelism 1) — enough to be slow for an attacker without making
   * login feel slow.
   */
  private static readonly HASH_OPTIONS: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  };

  async signup(
    dto: SignupDto,
    context: RequestContext,
  ): Promise<TokenPair & { profile: AuthenticatedProfile }> {
    const passwordHash = await argon2.hash(dto.password, AuthService.HASH_OPTIONS);
    const currency = dto.currency ?? 'INR';

    // One transaction: a merchant with no owner, or an owner with no merchant,
    // would both be unusable states.
    const user = await this.database.db.transaction(async (tx) => {
      const merchant = await this.users.createMerchant(
        {
          businessName: dto.businessName,
          country: dto.country ?? 'IN',
          defaultCurrency: currency,
          supportEmail: dto.email,
        },
        tx,
      );

      const created = await this.users.createUser(
        {
          merchantId: merchant.id,
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: 'OWNER',
          lastLoginAt: new Date(),
        },
        tx,
      );

      // A placeholder destination so the payout screen has something to show and
      // the "must be verified" rule is immediately visible rather than abstract.
      await this.bankAccounts.createPlaceholder(
        { merchantId: merchant.id, businessName: dto.businessName, currency },
        tx,
      );

      return created;
    });

    const pair = await this.tokens.issuePair(user, context);
    return { ...pair, profile: await this.profileFor(user.id) };
  }

  async login(
    dto: LoginDto,
    context: RequestContext,
  ): Promise<TokenPair & { profile: AuthenticatedProfile }> {
    const user = await this.users.findByEmail(dto.email);

    // Always verify against *something*, so the timing of a miss matches a hit.
    const passwordMatches = await argon2
      .verify(user?.passwordHash ?? DUMMY_HASH, dto.password)
      .catch(() => false);

    // One message for both branches: confirming that an email exists is a free
    // account-enumeration oracle for credential-stuffing.
    if (!user || !passwordMatches) {
      this.logger.warn(`Failed login attempt for ${dto.email} from ${context.ipAddress ?? 'unknown IP'}`);
      throw new UnauthorizedException('Invalid email or password.');
    }

    await this.users.updateLastLogin(user.id);

    const pair = await this.tokens.issuePair(user, context);
    return { ...pair, profile: await this.profileFor(user.id) };
  }

  async refresh(refreshToken: string, context: RequestContext): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken, context);
  }

  /**
   * Completes an invite: verifies the token, creates the User row with the
   * invitation's merchant and role, and signs the new teammate straight in —
   * the same shape as `signup()`, just joining an existing merchant instead
   * of creating one.
   */
  async acceptInvite(
    dto: AcceptInviteDto,
    context: RequestContext,
  ): Promise<TokenPair & { profile: AuthenticatedProfile }> {
    const invitation = await this.team.findAcceptableInvitationByToken(hashToken(dto.token));

    // Every failure mode — unknown token, already accepted, revoked, expired
    // — reads identically. Distinguishing them would tell a caller which
    // guess was closest, which is exactly the enumeration risk a token-based
    // flow is meant to avoid.
    if (!invitation) {
      throw new BadRequestException('This invitation link is invalid or has expired.');
    }

    const existingUser = await this.users.findByEmail(invitation.email);
    if (existingUser) {
      throw new BadRequestException('This invitation link is invalid or has expired.');
    }

    const passwordHash = await argon2.hash(dto.password, AuthService.HASH_OPTIONS);

    const user = await this.database.db.transaction(async (tx) => {
      const created = await this.users.createUser(
        {
          merchantId: invitation.merchantId,
          email: invitation.email,
          passwordHash,
          fullName: dto.fullName,
          role: invitation.role,
          lastLoginAt: new Date(),
        },
        tx,
      );

      await this.team.markInvitationAccepted(invitation.id, tx);

      return created;
    });

    const pair = await this.tokens.issuePair(user, context);
    return { ...pair, profile: await this.profileFor(user.id) };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) {
      await this.tokens.revoke(refreshToken);
    }
  }

  async profileFor(userId: string): Promise<AuthenticatedProfile> {
    const user = findOrThrow(await this.users.findWithMerchant(userId));
    return AuthService.toProfile(user);
  }

  /** Explicit projection: never let a `passwordHash` reach a response by default. */
  private static toProfile(user: UserRow & { merchant: MerchantRow }): AuthenticatedProfile {
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        lastLoginAt: user.lastLoginAt,
      },
      merchant: {
        id: user.merchant.id,
        businessName: user.merchant.businessName,
        country: user.merchant.country,
        defaultCurrency: user.merchant.defaultCurrency,
        supportEmail: user.merchant.supportEmail,
      },
    };
  }
}
