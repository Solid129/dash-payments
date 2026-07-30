import { ConflictException, NotFoundException } from '@nestjs/common';

import { UserRole } from '../user.schema';
import { UserService } from '../user.service';
import { TokenService } from '../../auth/token.service';
import { TeamMailService } from './team-mail.service';
import { TeamRepository } from './team.repository';
import { TeamService } from './team.service';

const MERCHANT_ID = 'merchant-1';

describe('TeamService', () => {
  let team: TeamService;
  let invitations: {
    findByTokenHash: jest.Mock;
    findPending: jest.Mock;
    listPending: jest.Mock;
    insert: jest.Mock;
    markAccepted: jest.Mock;
    revoke: jest.Mock;
  };
  let users: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    getMerchantById: jest.Mock;
    getMemberOrThrow: jest.Mock;
    changeMemberRole: jest.Mock;
    removeMember: jest.Mock;
    listMembers: jest.Mock;
  };
  let mail: { sendInvite: jest.Mock };
  let tokens: { revokeAllForUser: jest.Mock };

  beforeEach(() => {
    invitations = {
      findByTokenHash: jest.fn(),
      findPending: jest.fn(),
      listPending: jest.fn(),
      insert: jest.fn(),
      markAccepted: jest.fn(),
      revoke: jest.fn(),
    };
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      getMerchantById: jest.fn(),
      getMemberOrThrow: jest.fn(),
      changeMemberRole: jest.fn().mockResolvedValue(undefined),
      removeMember: jest.fn().mockResolvedValue(undefined),
      listMembers: jest.fn(),
    };
    mail = { sendInvite: jest.fn() };
    tokens = { revokeAllForUser: jest.fn().mockResolvedValue(undefined) };

    team = new TeamService(
      invitations as unknown as TeamRepository,
      users as unknown as UserService,
      mail as unknown as TeamMailService,
      tokens as unknown as TokenService,
    );
  });

  describe('invite', () => {
    it('rejects an email that already has an account', async () => {
      users.findByEmail.mockResolvedValue({ id: 'existing-user' });

      await expect(
        team.invite(MERCHANT_ID, 'owner-1', {
          email: 'taken@brew.test',
          fullName: 'Someone',
          role: UserRole.ACCOUNTANT,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects an email with an existing pending invitation', async () => {
      users.findByEmail.mockResolvedValue(undefined);
      invitations.findPending.mockResolvedValue({ id: 'existing-invite' });

      await expect(
        team.invite(MERCHANT_ID, 'owner-1', {
          email: 'pending@brew.test',
          fullName: 'Someone',
          role: UserRole.SUPPORT,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates the invitation and sends the mock email', async () => {
      users.findByEmail.mockResolvedValue(undefined);
      invitations.findPending.mockResolvedValue(undefined);
      users.getMerchantById.mockResolvedValue({ businessName: 'Brew Co' });
      users.findById.mockResolvedValue({ fullName: 'Owner Person' });
      invitations.insert.mockResolvedValue({
        id: 'invite-1',
        email: 'new@brew.test',
        role: UserRole.ACCOUNTANT,
      });

      const result = await team.invite(MERCHANT_ID, 'owner-1', {
        email: 'new@brew.test',
        fullName: 'New Person',
        role: UserRole.ACCOUNTANT,
      });

      expect(mail.sendInvite).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@brew.test', businessName: 'Brew Co' }),
      );
      expect(result.email).toBe('new@brew.test');
      // NODE_ENV is 'test' here, not 'production', so the dev token is included.
      expect(result.devInviteToken).toBeDefined();
    });
  });

  describe('updateMemberRole', () => {
    it('delegates to UserService, which owns the last-owner guard', async () => {
      await team.updateMemberRole(MERCHANT_ID, 'owner-1', UserRole.ACCOUNTANT);
      expect(users.changeMemberRole).toHaveBeenCalledWith(MERCHANT_ID, 'owner-1', UserRole.ACCOUNTANT);
    });
  });

  describe('removeMember', () => {
    it('checks the member exists, then revokes sessions before deleting the row', async () => {
      users.getMemberOrThrow.mockResolvedValue({ id: 'owner-1', role: UserRole.OWNER });

      await team.removeMember(MERCHANT_ID, 'owner-1');

      expect(users.getMemberOrThrow).toHaveBeenCalledWith(MERCHANT_ID, 'owner-1');
      expect(tokens.revokeAllForUser).toHaveBeenCalledWith('owner-1');
      expect(users.removeMember).toHaveBeenCalledWith(MERCHANT_ID, 'owner-1');
    });

    it('propagates a 404 for a member that does not belong to this merchant, without touching sessions', async () => {
      users.getMemberOrThrow.mockRejectedValue(new NotFoundException('Team member not found.'));

      await expect(team.removeMember(MERCHANT_ID, 'not-a-member')).rejects.toThrow(NotFoundException);
      expect(tokens.revokeAllForUser).not.toHaveBeenCalled();
      expect(users.removeMember).not.toHaveBeenCalled();
    });
  });

  describe('revokeInvitation', () => {
    it('throws 404 when nothing pending matches', async () => {
      invitations.revoke.mockResolvedValue(undefined);

      await expect(team.revokeInvitation(MERCHANT_ID, 'invite-1')).rejects.toThrow(NotFoundException);
    });

    it('revokes a matching pending invitation', async () => {
      invitations.revoke.mockResolvedValue({ id: 'invite-1' });

      await expect(team.revokeInvitation(MERCHANT_ID, 'invite-1')).resolves.toBeUndefined();
    });
  });
});
