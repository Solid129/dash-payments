import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';

import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthResult, AuthService } from './auth.service';
import { AcceptInviteDto, LoginDto, SignupDto, RefreshTokenDto, LogoutDto } from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  @ApiOperation({ summary: 'Create a merchant account and sign in' })
  @ApiResponse({ status: 201, description: 'Account created; tokens returned in response body' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async signup(
    @Body() dto: SignupDto,
    @Req() request: Request,
  ): Promise<AuthResult> {
    return this.auth.signup(dto, this.contextFrom(request));
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in' })
  @ApiResponse({ status: 200, description: 'Signed in; tokens returned in response body' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
  ): Promise<AuthResult> {
    return this.auth.login(dto, this.contextFrom(request));
  }

  @Public()
  @Throttle({ auth: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the token pair using the refresh token' })
  @ApiResponse({ status: 200, description: 'New token pair returned in response body' })
  @ApiResponse({ status: 400, description: 'Missing or invalid refresh token' })
  @ApiResponse({ status: 401, description: 'Expired or reused refresh token' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() request: Request): Promise<{ accessToken: string; refreshToken: string }> {
    return this.auth.refresh(dto.refreshToken, this.contextFrom(request));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the refresh token' })
  @ApiResponse({ status: 200, description: 'Token revoked (or was already invalid/expired)' })
  async logout(@Body() dto: LogoutDto): Promise<{ success: true }> {
    await this.auth.logout(dto.refreshToken);
    return { success: true };
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @Post('accept-invite')
  @ApiOperation({ summary: 'Join a merchant using an invite link, and sign in' })
  @ApiResponse({ status: 201, description: 'Account created; tokens returned in response body' })
  @ApiResponse({ status: 400, description: 'Invalid, expired, or already-used invitation' })
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Req() request: Request,
  ): Promise<AuthResult> {
    return this.auth.acceptInvite(dto, this.contextFrom(request));
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The signed-in user and their merchant' })
  @ApiResponse({ status: 401, description: 'Not signed in' })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<{ user: { id: string; email: string; fullName: string; role: string; lastLoginAt: Date | null }; merchant: { id: string; businessName: string; country: string; defaultCurrency: string; supportEmail: string | null } }> {
    return this.auth.profileFor(user.userId);
  }

  private contextFrom(request: Request): { userAgent?: string; ipAddress?: string } {
    return {
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
    };
  }
}
