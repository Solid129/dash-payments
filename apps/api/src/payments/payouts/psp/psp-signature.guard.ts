import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

import { SIGNATURE_HEADER, verifySignature } from './webhook-signature';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Authenticates inbound PSP webhooks.
 *
 * This is the guard that replaces `JwtAuthGuard` on the one `@Public()` route in
 * the app. The callback arrives from a server, not a browser, so there is no
 * session — the HMAC over the request body *is* the credential, and it is a
 * stronger one than a shared bearer token because it also proves the body wasn't
 * altered in transit.
 */
@Injectable()
export class PspSignatureGuard implements CanActivate {
  private readonly logger = new Logger(PspSignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest>();

    // Verifying against the parsed-and-reserialised body would be subtly wrong:
    // JSON.stringify can reorder keys and drop whitespace, changing the bytes the
    // provider actually signed. `rawBody: true` in main.ts is what makes this
    // available, so its absence is a misconfiguration rather than a client error.
    if (!request.rawBody) {
      this.logger.error(
        'Raw body unavailable — the app must be created with { rawBody: true } for webhook verification to work.',
      );
      throw new UnauthorizedException('Signature could not be verified.');
    }

    const result = verifySignature({
      rawBody: request.rawBody.toString('utf8'),
      header: request.headers[SIGNATURE_HEADER] as string | undefined,
      secret: this.config.getOrThrow<string>('PSP_WEBHOOK_SECRET'),
    });

    if (!result.valid) {
      // The reason is logged for operators but never returned: telling a caller
      // *why* their forgery failed helps them iterate towards one that works.
      this.logger.warn(`Rejected webhook delivery from ${request.ip ?? 'unknown'}: ${result.reason}`);
      throw new UnauthorizedException('Signature could not be verified.');
    }

    return true;
  }
}
