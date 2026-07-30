import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { UserRole } from '../user.schema';
import { UserService } from '../user.service';
import { generateToken, hashToken } from '../../common/crypto';
import { Db } from '../../common/db/db.types';
import { TokenService } from '../../auth/token.service';
import { InviteTeammateDto } from './dto/invite-teammate.dto';
import { TeamMailService } from './team-mail.service';
import { TeamRepository } from './team.repository';

/** How long an invite link stays valid. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class TeamService {
  constructor(
    private readonly invitations: TeamRepository,
    private readonly users: UserService,
    private readonly mail: TeamMailService,
    private readonly tokens: TokenService,
  ) {}

  async listMembers(merchantId: string) {
    return this.users.listMembers(merchantId);
  }

  async listPendingInvitations(merchantId: string) {
    return this.invitations.listPending(merchantId);
  }

  async invite(
    merchantId: string,
    invitedByUserId: string,
    dto: InviteTeammateDto,
  ): Promise<{ id: string; email: string; role: UserRole; devInviteToken?: string }> {
    const existingUser = await this.users.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('That email address already has an account.');
    }

    const existingInvitation = await this.invitations.findPending(merchantId, dto.email);
    if (existingInvitation) {
      throw new ConflictException('That email address already has a pending invitation.');
    }

    const [merchant, inviter] = await Promise.all([
      this.users.getMerchantById(merchantId),
      this.users.findById(invitedByUserId).then((user) => {
        if (!user) throw new NotFoundException('Inviting user not found.');
        return user;
      }),
    ]);

    const token = generateToken();
    const invitation = await this.invitations.insert({
      merchantId,
      email: dto.email,
      role: dto.role,
      tokenHash: hashToken(token),
      invitedByUserId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });

    this.mail.sendInvite({
      email: dto.email,
      businessName: merchant.businessName,
      inviterName: inviter.fullName,
      token,
    });

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      // Only so the flow is clickable in dev without a real inbox — see
      // TeamMailService's own comment on why nothing is actually emailed.
      ...(process.env.NODE_ENV !== 'production' ? { devInviteToken: token } : {}),
    };
  }

  async revokeInvitation(merchantId: string, invitationId: string): Promise<void> {
    const row = await this.invitations.revoke(merchantId, invitationId);
    if (!row) {
      throw new NotFoundException('Invitation not found or already resolved.');
    }
  }

  async updateMemberRole(merchantId: string, userId: string, role: UserRole): Promise<void> {
    await this.users.changeMemberRole(merchantId, userId, role);
  }

  async removeMember(merchantId: string, userId: string): Promise<void> {
    // Revoking sessions before deleting is belt-and-braces: the cascade on
    // User -> RefreshToken already removes them, but an in-flight request
    // holding a still-valid access token should stop working within its
    // remaining lifetime regardless of the row's fate.
    await this.users.getMemberOrThrow(merchantId, userId);
    await this.tokens.revokeAllForUser(userId);
    await this.users.removeMember(merchantId, userId);
  }

  /**
   * The one piece of invitation lookup `AuthService.acceptInvite` needs.
   * Every failure mode — unknown token, already accepted, revoked, expired —
   * is folded into a single `undefined`. Distinguishing them would tell a
   * caller which guess was closest, which is exactly the enumeration risk a
   * token-based flow is meant to avoid.
   */
  async findAcceptableInvitationByToken(tokenHash: string) {
    const invitation = await this.invitations.findByTokenHash(tokenHash);
    const isUsable =
      invitation && !invitation.acceptedAt && !invitation.revokedAt && invitation.expiresAt > new Date();
    return isUsable ? invitation : undefined;
  }

  async markInvitationAccepted(invitationId: string, client?: Db): Promise<void> {
    await this.invitations.markAccepted(invitationId, client);
  }
}
