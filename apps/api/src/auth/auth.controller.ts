import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';

import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedProfile, AuthService } from './auth.service';
import { clearAuthCookies, durationToMs, REFRESH_TOKEN_COOKIE, setAuthCookies } from './cookies';
import { AcceptInviteDto, LoginDto, SignupDto } from './dto/auth.dto';
import { TokenPair } from './token.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  // Signup is rate limited too: unthrottled account creation is a spam vector.
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  @ApiOperation({ summary: 'Create a merchant account and sign in' })
  @ApiResponse({ status: 201, description: 'Account created; auth cookies set' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async signup(
    @Body() dto: SignupDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedProfile> {
    const { profile, ...tokens } = await this.auth.signup(dto, this.contextFrom(request));
    this.applyCookies(response, tokens);
    return profile;
  }

  @Public()
  // 10/minute/IP: enough for a person fumbling their password, far too slow for
  // credential stuffing.
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in' })
  @ApiResponse({ status: 200, description: 'Signed in; auth cookies set' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedProfile> {
    const { profile, ...tokens } = await this.auth.login(dto, this.contextFrom(request));
    this.applyCookies(response, tokens);
    return profile;
  }

  /**
   * Public in the sense that it takes no access token — the refresh cookie *is*
   * the credential. It is deliberately more heavily throttled than login, since a
   * flood of refreshes is either a bug or an attack.
   */
  @Public()
  @Throttle({ auth: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the token pair using the refresh cookie' })
  @ApiResponse({ status: 200, description: 'New cookies set' })
  @ApiResponse({ status: 401, description: 'Missing, expired, or reused refresh token' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    const token = request.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!token) {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    try {
      const tokens = await this.auth.refresh(token, this.contextFrom(request));
      this.applyCookies(response, tokens);
      return { success: true };
    } catch (error) {
      // Clear the cookies on failure so a stale or revoked token stops being
      // resent on every subsequent request.
      clearAuthCookies(response, this.isProduction);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the refresh token and clear cookies' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    // Public and idempotent: logging out should always succeed, even from an
    // already-expired session. Failing here would leave cookies behind.
    await this.auth.logout(request.cookies?.[REFRESH_TOKEN_COOKIE]);
    clearAuthCookies(response, this.isProduction);
    return { success: true };
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @Post('accept-invite')
  @ApiOperation({ summary: 'Join a merchant using an invite link, and sign in' })
  @ApiResponse({ status: 201, description: 'Account created; auth cookies set' })
  @ApiResponse({ status: 400, description: 'Invalid, expired, or already-used invitation' })
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedProfile> {
    const { profile, ...tokens } = await this.auth.acceptInvite(dto, this.contextFrom(request));
    this.applyCookies(response, tokens);
    return profile;
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'The signed-in user and their merchant' })
  @ApiResponse({ status: 401, description: 'Not signed in' })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<AuthenticatedProfile> {
    return this.auth.profileFor(user.userId);
  }

  private get isProduction(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  private applyCookies(response: Response, tokens: TokenPair): void {
    setAuthCookies(response, tokens, {
      isProduction: this.isProduction,
      accessTtlMs: durationToMs(this.config.getOrThrow<string>('JWT_ACCESS_TTL')),
      refreshTtlMs: durationToMs(this.config.getOrThrow<string>('JWT_REFRESH_TTL')),
    });
  }

  private contextFrom(request: Request): { userAgent?: string; ipAddress?: string } {
    return {
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
    };
  }
}
