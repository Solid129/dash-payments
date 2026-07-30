import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Stands in for a transactional email provider, the same way `MockPspService`
 * stands in for a payment provider: no real email is ever sent, and this is
 * the one place that's true, rather than something the caller has to
 * remember. In non-production, the raw invite link is also handed back to the
 * caller (see `TeamService.invite`) so the flow is clickable without a real
 * inbox — this method's job is just to be honest about what "sending" means
 * here.
 */
@Injectable()
export class TeamMailService {
  private readonly logger = new Logger(TeamMailService.name);

  constructor(private readonly config: ConfigService) {}

  sendInvite(params: { email: string; businessName: string; inviterName: string; token: string }): void {
    const webOrigin = this.config.getOrThrow<string>('WEB_ORIGIN').split(',')[0].trim();
    const acceptUrl = `${webOrigin}/accept-invite/${params.token}`;

    this.logger.log(
      `[mock email] To: ${params.email} — "${params.inviterName} invited you to join ${params.businessName} on Northwind Payments" — accept at ${acceptUrl}`,
    );
  }
}
