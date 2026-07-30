import { BadRequestException, Injectable } from '@nestjs/common';

import { Db } from '../common/db/db.types';
import { findOrThrow } from '../common/db/query-helpers';
import { merchants, users, UserRole } from './user.schema';
import { UserRepository } from './user.repository';

type NewMerchant = typeof merchants.$inferInsert;
type NewUser = typeof users.$inferInsert;

/**
 * Business logic for merchants and their logins. Everything else in the
 * backend that needs merchant/user data goes through this service, never
 * through `UserRepository` directly — that's what keeps the data layer for
 * these two tables in one place.
 */
@Injectable()
export class UserService {
  constructor(private readonly users: UserRepository) {}

  async createMerchant(data: NewMerchant, client?: Db) {
    return this.users.insertMerchant(data, client);
  }

  async getMerchantById(id: string, client?: Db) {
    return findOrThrow(await this.users.findMerchantById(id, client));
  }

  async createUser(data: NewUser, client?: Db) {
    return this.users.insertUser(data, client);
  }

  async findByEmail(email: string) {
    return this.users.findUserByEmail(email);
  }

  async findById(id: string) {
    return this.users.findUserById(id);
  }

  async findAuthContext(id: string) {
    return this.users.findUserAuthColumns(id);
  }

  async findWithMerchant(id: string) {
    return this.users.findUserWithMerchant(id);
  }

  async updateLastLogin(userId: string, client?: Db): Promise<void> {
    await this.users.updateLastLogin(userId, client);
  }

  async listMembers(merchantId: string) {
    return this.users.listByMerchant(merchantId);
  }

  async getMemberOrThrow(merchantId: string, userId: string) {
    return findOrThrow(await this.users.findMemberById(merchantId, userId), 'Team member not found.');
  }

  async changeMemberRole(merchantId: string, userId: string, role: UserRole): Promise<void> {
    const member = await this.getMemberOrThrow(merchantId, userId);

    if (member.role === UserRole.OWNER && role !== UserRole.OWNER) {
      await this.assertNotLastOwner(merchantId, userId);
    }

    await this.users.updateRole(userId, role);
  }

  /** Removes the member's row. Revoking their sessions first is the caller's job. */
  async removeMember(merchantId: string, userId: string): Promise<void> {
    const member = await this.getMemberOrThrow(merchantId, userId);

    if (member.role === UserRole.OWNER) {
      await this.assertNotLastOwner(merchantId, userId);
    }

    await this.users.deleteById(userId);
  }

  /**
   * Refuses to leave a merchant with zero owners. Checked by counting OWNERs
   * excluding the member being changed, rather than relying on any database
   * constraint — Postgres has no clean way to express "at least one row
   * matching X" as a check constraint across a whole table.
   */
  private async assertNotLastOwner(merchantId: string, excludingUserId: string): Promise<void> {
    const remainingOwners = await this.users.countOwnersExcluding(merchantId, excludingUserId);
    if (remainingOwners === 0) {
      throw new BadRequestException('A merchant must always have at least one owner.');
    }
  }
}
