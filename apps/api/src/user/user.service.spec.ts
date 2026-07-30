import { BadRequestException, NotFoundException } from '@nestjs/common';

import { UserRole } from './user.schema';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';

const MERCHANT_ID = 'merchant-1';

describe('UserService', () => {
  let service: UserService;
  let repo: {
    findMemberById: jest.Mock;
    countOwnersExcluding: jest.Mock;
    updateRole: jest.Mock;
    deleteById: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      findMemberById: jest.fn(),
      countOwnersExcluding: jest.fn(),
      updateRole: jest.fn().mockResolvedValue(undefined),
      deleteById: jest.fn().mockResolvedValue(undefined),
    };

    service = new UserService(repo as unknown as UserRepository);
  });

  describe('changeMemberRole (the last-owner guard)', () => {
    it('refuses to demote the sole owner', async () => {
      repo.findMemberById.mockResolvedValue({ id: 'owner-1', role: UserRole.OWNER });
      repo.countOwnersExcluding.mockResolvedValue(0); // no other owners

      await expect(service.changeMemberRole(MERCHANT_ID, 'owner-1', UserRole.ACCOUNTANT)).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.updateRole).not.toHaveBeenCalled();
    });

    it('allows demoting an owner when another owner remains', async () => {
      repo.findMemberById.mockResolvedValue({ id: 'owner-1', role: UserRole.OWNER });
      repo.countOwnersExcluding.mockResolvedValue(1); // one other owner

      await service.changeMemberRole(MERCHANT_ID, 'owner-1', UserRole.ACCOUNTANT);
      expect(repo.updateRole).toHaveBeenCalledWith('owner-1', UserRole.ACCOUNTANT);
    });

    it("allows changing a non-owner's role without checking the owner count", async () => {
      repo.findMemberById.mockResolvedValue({ id: 'user-1', role: UserRole.SUPPORT });

      await service.changeMemberRole(MERCHANT_ID, 'user-1', UserRole.ACCOUNTANT);
      expect(repo.countOwnersExcluding).not.toHaveBeenCalled();
      expect(repo.updateRole).toHaveBeenCalled();
    });

    it('throws 404 for a member that does not belong to this merchant', async () => {
      repo.findMemberById.mockResolvedValue(undefined);

      await expect(
        service.changeMemberRole(MERCHANT_ID, 'not-a-member', UserRole.ACCOUNTANT),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeMember (the last-owner guard)', () => {
    it('refuses to remove the sole owner', async () => {
      repo.findMemberById.mockResolvedValue({ id: 'owner-1', role: UserRole.OWNER });
      repo.countOwnersExcluding.mockResolvedValue(0);

      await expect(service.removeMember(MERCHANT_ID, 'owner-1')).rejects.toThrow(BadRequestException);
      expect(repo.deleteById).not.toHaveBeenCalled();
    });

    it('allows removing an owner when another owner remains', async () => {
      repo.findMemberById.mockResolvedValue({ id: 'owner-1', role: UserRole.OWNER });
      repo.countOwnersExcluding.mockResolvedValue(1);

      await service.removeMember(MERCHANT_ID, 'owner-1');
      expect(repo.deleteById).toHaveBeenCalledWith('owner-1');
    });

    it('throws 404 for a member that does not belong to this merchant', async () => {
      repo.findMemberById.mockResolvedValue(undefined);

      await expect(service.removeMember(MERCHANT_ID, 'not-a-member')).rejects.toThrow(NotFoundException);
    });
  });
});
