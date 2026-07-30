import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { Db } from '../../../common/db/db.types';
import { DbService } from '../../../common/db/db.service';
import { webhookEvents, WebhookOutcome } from './psp.schema';

type NewWebhookEvent = typeof webhookEvents.$inferInsert;

/** All direct `webhookEvents` table access. No business rules here — see `PayoutWebhooksService`. */
@Injectable()
export class PspRepository {
  constructor(private readonly database: DbService) {}

  async insertEvent(data: NewWebhookEvent, client: Db = this.database.db) {
    const [row] = await client.insert(webhookEvents).values(data).returning({ id: webhookEvents.id });
    return row;
  }

  async linkPayout(webhookEventId: string, payoutId: string, client: Db = this.database.db): Promise<void> {
    await client.update(webhookEvents).set({ payoutId }).where(eq(webhookEvents.id, webhookEventId));
  }

  async markProcessed(
    webhookEventId: string,
    outcome: WebhookOutcome,
    notes: string | undefined,
    client: Db = this.database.db,
  ): Promise<void> {
    await client
      .update(webhookEvents)
      .set({ outcome, notes, processedAt: new Date() })
      .where(eq(webhookEvents.id, webhookEventId));
  }
}
