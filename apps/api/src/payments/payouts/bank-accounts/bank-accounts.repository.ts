import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

import { Db } from '../../../common/db/db.types';
import { DbService } from '../../../common/db/db.service';
import { bankAccounts } from './bank-accounts.schema';

type NewBankAccount = typeof bankAccounts.$inferInsert;

const LIST_COLUMNS = {
  id: true,
  label: true,
  accountHolderName: true,
  bankName: true,
  last4: true,
  routingCode: true,
  currency: true,
  status: true,
  isDefault: true,
} as const;

/** All direct `bankAccounts` table access. No business rules here — see `BankAccountsService`. */
@Injectable()
export class BankAccountsRepository {
  constructor(private readonly database: DbService) {}

  async listByMerchant(merchantId: string, client: Db = this.database.db) {
    return client.query.bankAccounts.findMany({
      where: eq(bankAccounts.merchantId, merchantId),
      orderBy: [desc(bankAccounts.isDefault), bankAccounts.createdAt],
      columns: LIST_COLUMNS,
    });
  }

  async findById(id: string, client: Db = this.database.db) {
    return client.query.bankAccounts.findFirst({ where: eq(bankAccounts.id, id) });
  }

  async insert(data: NewBankAccount, client: Db = this.database.db) {
    const [bankAccount] = await client.insert(bankAccounts).values(data).returning();
    return bankAccount;
  }
}
