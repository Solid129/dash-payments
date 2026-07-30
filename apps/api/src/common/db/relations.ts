/**
 * Relation declarations for Drizzle's relational query API
 * (`db.query.<table>.findFirst({ with: {...} })`), the direct replacement for
 * Prisma's `include`. These don't create any SQL by themselves — they just
 * tell the query builder how tables join.
 *
 * Centralized here rather than colocated with each table: a "merchant has
 * many X" relation on one side and "X belongs to merchant" on the other would
 * otherwise need auth.schema.ts and every downstream domain's schema file to
 * import each other, which is a real circular-import risk under CommonJS
 * (two files requiring each other at module load, before either has finished
 * exporting). Importing every domain's tables into one leaf file — nothing
 * imports *this* file except the schema barrel — avoids that entirely.
 */

import { relations } from 'drizzle-orm';

import { merchants, refreshTokens, users } from '../../user/user.schema';
import { bankAccounts } from '../../payments/payouts/bank-accounts/bank-accounts.schema';
import { ledgerEntries } from '../../payments/ledger/ledger.schema';
import { payouts } from '../../payments/payouts/payouts.schema';
import { payoutSchedules } from '../../payments/payouts/auto-payout/auto-payout.schema';
import { webhookEvents } from '../../payments/payouts/psp/psp.schema';
import { invitations } from '../../user/team/team.schema';
import { customers, transactionEvents, transactions } from '../../payments/transactions/transactions.schema';
import { reportSubscriptions } from '../../reports/reports.schema';

export const merchantsRelations = relations(merchants, ({ many, one }) => ({
  users: many(users),
  invitations: many(invitations),
  customers: many(customers),
  transactions: many(transactions),
  bankAccounts: many(bankAccounts),
  payouts: many(payouts),
  payoutSchedule: one(payoutSchedules, {
    fields: [merchants.id],
    references: [payoutSchedules.merchantId],
  }),
  ledger: many(ledgerEntries),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  merchant: one(merchants, { fields: [users.merchantId], references: [merchants.id] }),
  refreshTokens: many(refreshTokens),
  initiatedPayouts: many(payouts),
  sentInvitations: many(invitations),
  reportSubscription: one(reportSubscriptions, {
    fields: [users.id],
    references: [reportSubscriptions.userId],
  }),
}));

export const reportSubscriptionsRelations = relations(reportSubscriptions, ({ one }) => ({
  user: one(users, { fields: [reportSubscriptions.userId], references: [users.id] }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  merchant: one(merchants, { fields: [invitations.merchantId], references: [merchants.id] }),
  invitedBy: one(users, { fields: [invitations.invitedByUserId], references: [users.id] }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  merchant: one(merchants, { fields: [customers.merchantId], references: [merchants.id] }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  merchant: one(merchants, { fields: [transactions.merchantId], references: [merchants.id] }),
  customer: one(customers, { fields: [transactions.customerId], references: [customers.id] }),
  parent: one(transactions, {
    fields: [transactions.parentTransactionId],
    references: [transactions.id],
    relationName: 'transactionRefunds',
  }),
  refunds: many(transactions, { relationName: 'transactionRefunds' }),
  events: many(transactionEvents),
  ledger: many(ledgerEntries),
}));

export const transactionEventsRelations = relations(transactionEvents, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionEvents.transactionId],
    references: [transactions.id],
  }),
}));

export const bankAccountsRelations = relations(bankAccounts, ({ one, many }) => ({
  merchant: one(merchants, { fields: [bankAccounts.merchantId], references: [merchants.id] }),
  payouts: many(payouts),
}));

export const payoutsRelations = relations(payouts, ({ one, many }) => ({
  merchant: one(merchants, { fields: [payouts.merchantId], references: [merchants.id] }),
  bankAccount: one(bankAccounts, { fields: [payouts.bankAccountId], references: [bankAccounts.id] }),
  initiatedBy: one(users, { fields: [payouts.initiatedByUserId], references: [users.id] }),
  ledger: many(ledgerEntries),
  webhookEvents: many(webhookEvents),
}));

export const webhookEventsRelations = relations(webhookEvents, ({ one }) => ({
  payout: one(payouts, { fields: [webhookEvents.payoutId], references: [payouts.id] }),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  merchant: one(merchants, { fields: [ledgerEntries.merchantId], references: [merchants.id] }),
  transaction: one(transactions, { fields: [ledgerEntries.transactionId], references: [transactions.id] }),
  payout: one(payouts, { fields: [ledgerEntries.payoutId], references: [payouts.id] }),
}));

export const payoutSchedulesRelations = relations(payoutSchedules, ({ one }) => ({
  merchant: one(merchants, { fields: [payoutSchedules.merchantId], references: [merchants.id] }),
  bankAccount: one(bankAccounts, { fields: [payoutSchedules.bankAccountId], references: [bankAccounts.id] }),
}));
