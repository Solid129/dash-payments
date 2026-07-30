import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AccessTokenPayload } from '../../auth/token.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { UserService } from '../../user/user.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly users: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * Called only after the signature and expiry check pass.
   *
   * We still hit the database, because a valid signature only proves the token
   * was ours when issued — not that the account still exists or still belongs to
   * the same merchant. Reading `merchantId` from the row rather than the token
   * also means a revoked or moved user can't keep acting on stale claims for the
   * remainder of the token's 15-minute life.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.users.findAuthContext(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Your session is no longer valid. Please sign in again.');
    }

    return {
      userId: user.id,
      merchantId: user.merchantId,
      email: user.email,
      role: user.role,
    };
  }
}
