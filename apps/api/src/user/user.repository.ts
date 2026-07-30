import { Injectable } from '@nestjs/common';
import { and, asc, eq, ne, sql } from 'drizzle-orm';

import { Db } from '../common/db/db.types';
import { DbService } from '../common/db/db.service';
import { merchants, users, UserRole } from './user.schema';

type NewMerchant = typeof merchants.$inferInsert;
type NewUser = typeof users.$inferInsert;

const MEMBER_LIST_COLUMNS = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

/** All direct `merchants`/`users` table access. No business rules here — see `UserService`. */
@Injectable()
export class UserRepository {
  constructor(private readonly database: DbService) {}

  async insertMerchant(data: NewMerchant, client: Db = this.database.db) {
    const [merchant] = await client.insert(merchants).values(data).returning();
    return merchant;
  }

  async findMerchantById(id: string, client: Db = this.database.db) {
    return client.query.merchants.findFirst({ where: eq(merchants.id, id) });
  }

  async insertUser(data: NewUser, client: Db = this.database.db) {
    const [user] = await client.insert(users).values(data).returning();
    return user;
  }

  async findUserByEmail(email: string, client: Db = this.database.db) {
    return client.query.users.findFirst({ where: eq(users.email, email) });
  }

  async findUserById(id: string, client: Db = this.database.db) {
    return client.query.users.findFirst({ where: eq(users.id, id) });
  }

  async findUserAuthColumns(id: string, client: Db = this.database.db) {
    return client.query.users.findFirst({
      where: eq(users.id, id),
      columns: { id: true, merchantId: true, email: true, role: true },
    });
  }

  async findUserWithMerchant(id: string, client: Db = this.database.db) {
    return client.query.users.findFirst({ where: eq(users.id, id), with: { merchant: true } });
  }

  async updateLastLogin(userId: string, client: Db = this.database.db): Promise<void> {
    await client.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  }

  async listByMerchant(merchantId: string, client: Db = this.database.db) {
    return client.query.users.findMany({
      where: eq(users.merchantId, merchantId),
      orderBy: [asc(users.createdAt)],
      columns: MEMBER_LIST_COLUMNS,
    });
  }

  async findMemberById(merchantId: string, userId: string, client: Db = this.database.db) {
    return client.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.merchantId, merchantId)),
    });
  }

  async updateRole(userId: string, role: UserRole, client: Db = this.database.db): Promise<void> {
    await client.update(users).set({ role }).where(eq(users.id, userId));
  }

  async deleteById(userId: string, client: Db = this.database.db): Promise<void> {
    await client.delete(users).where(eq(users.id, userId));
  }

  async countOwnersExcluding(
    merchantId: string,
    excludingUserId: string,
    client: Db = this.database.db,
  ): Promise<number> {
    const [{ count }] = await client
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(eq(users.merchantId, merchantId), eq(users.role, UserRole.OWNER), ne(users.id, excludingUserId)),
      );
    return count;
  }
}
