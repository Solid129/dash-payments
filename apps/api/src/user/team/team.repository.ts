import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';

import { Db } from '../../common/db/db.types';
import { DbService } from '../../common/db/db.service';
import { invitations } from './team.schema';

type NewInvitation = typeof invitations.$inferInsert;

const LIST_COLUMNS = { id: true, email: true, role: true, createdAt: true, expiresAt: true } as const;

/** All direct `invitations` table access. No business rules here — see `TeamService`. */
@Injectable()
export class TeamRepository {
  constructor(private readonly database: DbService) {}

  async findByTokenHash(tokenHash: string, client: Db = this.database.db) {
    return client.query.invitations.findFirst({ where: eq(invitations.tokenHash, tokenHash) });
  }

  /** An unaccepted, unrevoked, unexpired invitation for this merchant+email, if any. */
  async findPending(merchantId: string, email: string, client: Db = this.database.db) {
    return client.query.invitations.findFirst({
      where: and(
        eq(invitations.merchantId, merchantId),
        eq(invitations.email, email),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    });
  }

  async listPending(merchantId: string, client: Db = this.database.db) {
    return client.query.invitations.findMany({
      where: and(
        eq(invitations.merchantId, merchantId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ),
      orderBy: [desc(invitations.createdAt)],
      columns: LIST_COLUMNS,
    });
  }

  async insert(data: NewInvitation, client: Db = this.database.db) {
    const [invitation] = await client.insert(invitations).values(data).returning();
    return invitation;
  }

  async markAccepted(id: string, client: Db = this.database.db): Promise<void> {
    await client.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, id));
  }

  /** Revokes a still-pending invitation; returns the row if one matched, else `undefined`. */
  async revoke(merchantId: string, id: string, client: Db = this.database.db) {
    const [row] = await client
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invitations.id, id),
          eq(invitations.merchantId, merchantId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .returning({ id: invitations.id });
    return row;
  }
}
