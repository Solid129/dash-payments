import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { TokenRepository } from './token.repository';
import { TokenService } from './token.service';

/**
 * Split out of `AuthModule` so `TeamModule` can use `TokenService` (to revoke a
 * removed member's sessions) without importing all of `AuthModule` — which
 * would create a cycle once `AuthModule` needs `TeamModule` back for invitation
 * lookups during accept-invite. `TokenService` never depended on `AuthService`.
 */
@Module({
  imports: [
    // Secrets are passed per-sign/verify call in TokenService rather than
    // registered here, because access and refresh tokens use different secrets.
    // A refresh token must not be accepted where an access token is expected.
    JwtModule.register({}),
  ],
  providers: [TokenRepository, TokenService],
  exports: [TokenService],
})
export class TokenModule {}
