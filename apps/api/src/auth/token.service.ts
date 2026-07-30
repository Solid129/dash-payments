import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';

import { hashToken } from '../common/crypto';
import { Db } from '../common/db/db.types';
import { DbService } from '../common/db/db.service';
import { users } from '../user/user.schema';
import { TokenRepository } from './token.repository';

type UserRow = typeof users.$inferSelect;

export interface AccessTokenPayload {
  sub: string;
  merchantId: string;
  email: string;
  role: string;
}

interface RefreshTokenPayload {
  sub: string;
  jti: string;
  familyId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly database: DbService,
    private readonly tokens: TokenRepository,
  ) {}

  async issuePair(
    user: UserRow,
    context: RequestContext = {},
    familyId?: string,
    /** Pass the transaction client when issuing as part of a larger unit of work. */
    client: Db = this.database.db,
  ): Promise<TokenPair> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      merchantId: user.merchantId,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.getOrThrow<string>('JWT_ACCESS_TTL'),
    });

    const jti = randomUUID();
    const resolvedFamilyId = familyId ?? randomUUID();

    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      jti,
      familyId: resolvedFamilyId,
    };

    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.getOrThrow<string>('JWT_REFRESH_TTL'),
    });

    const decoded = this.jwt.decode(refreshToken) as { exp: number };

    await this.tokens.insert(
      {
        id: jti,
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        familyId: resolvedFamilyId,
        expiresAt: new Date(decoded.exp * 1000),
        userAgent: context.userAgent?.slice(0, 255),
        ipAddress: context.ipAddress,
      },
      client,
    );

    return { accessToken, refreshToken };
  }

  /**
   * Rotates a refresh token: the presented token is revoked and a fresh pair is
   * issued in its place, inside one transaction.
   *
   * The important case is **reuse**. A token that verifies cryptographically but
   * is already revoked means the same token was presented twice — either it was
   * stolen and replayed, or the legitimate holder's replacement was stolen.
   * Either way we can't tell which party is which, so the entire family is
   * revoked and both are forced to re-authenticate. Rotating without this check
   * would let a thief refresh indefinitely alongside the real user.
   */
  async rotate(presentedToken: string, context: RequestContext = {}): Promise<TokenPair> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(presentedToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    const stored = await this.tokens.findByHashWithUser(hashToken(presentedToken));

    if (!stored) {
      // Verified signature but unknown to us: the row was pruned, or the whole
      // family was already revoked and deleted.
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    if (stored.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for user ${stored.userId}; revoking token family ${stored.familyId}`,
      );
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    if (stored.expiresAt <= new Date()) {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    // Issuing the replacement and revoking the old token must be atomic: a crash
    // between the two would either strand the user with a revoked-only session or
    // leave two live tokens in the same family.
    return this.database.db.transaction(async (tx) => {
      const pair = await this.issuePair(stored.user, context, payload.familyId, tx);

      await this.tokens.revokeById(
        stored.id,
        (this.jwt.decode(pair.refreshToken) as RefreshTokenPayload).jti,
        tx,
      );

      return pair;
    });
  }

  async revoke(presentedToken: string): Promise<void> {
    // Matches on "unrevoked" too rather than throwing: logging out with an
    // already-unknown or already-revoked token should succeed quietly, not 404.
    await this.tokens.revokeByHash(hashToken(presentedToken));
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.tokens.revokeFamily(familyId);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.tokens.revokeAllForUser(userId);
  }
}
