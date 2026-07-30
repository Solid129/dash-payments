import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { Db } from '../common/db/db.types';
import { DbService } from '../common/db/db.service';
import { refreshTokens } from '../user/user.schema';

type NewRefreshToken = typeof refreshTokens.$inferInsert;

/** All direct `refreshTokens` table access. No business rules here — see `TokenService`. */
@Injectable()
export class TokenRepository {
  constructor(private readonly database: DbService) {}

  async insert(data: NewRefreshToken, client: Db = this.database.db): Promise<void> {
    await client.insert(refreshTokens).values(data);
  }

  async findByHashWithUser(tokenHash: string, client: Db = this.database.db) {
    return client.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, tokenHash),
      with: { user: true },
    });
  }

  async revokeById(id: string, replacedById: string, client: Db = this.database.db): Promise<void> {
    await client
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedById })
      .where(eq(refreshTokens.id, id));
  }

  async revokeByHash(tokenHash: string, client: Db = this.database.db): Promise<void> {
    await client
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
  }

  async revokeFamily(familyId: string, client: Db = this.database.db): Promise<void> {
    await client
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  async revokeAllForUser(userId: string, client: Db = this.database.db): Promise<void> {
    await client
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }
}
