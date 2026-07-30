CREATE TYPE "public"."user_role" AS ENUM('OWNER', 'ACCOUNTANT', 'SUPPORT');--> statement-breakpoint
CREATE TYPE "public"."bank_account_status" AS ENUM('PENDING', 'VERIFIED', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CARD', 'BANK_TRANSFER', 'UPI', 'WALLET');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('PAYMENT', 'REFUND');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('PENDING', 'PROCESSING', 'PAID', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."webhook_outcome" AS ENUM('APPLIED', 'DUPLICATE', 'IGNORED_ILLEGAL_TRANSITION', 'UNKNOWN_PAYOUT');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_kind" AS ENUM('PAYMENT_NET', 'REFUND', 'FEE_ADJUSTMENT', 'PAYOUT', 'PAYOUT_REVERSAL');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_state" AS ENUM('PENDING', 'AVAILABLE');--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"businessName" text NOT NULL,
	"legalName" text,
	"country" char(2) NOT NULL,
	"defaultCurrency" char(3) NOT NULL,
	"supportEmail" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"tokenHash" text NOT NULL,
	"familyId" uuid NOT NULL,
	"expiresAt" timestamp (3) NOT NULL,
	"revokedAt" timestamp (3),
	"replacedById" uuid,
	"userAgent" text,
	"ipAddress" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchantId" uuid NOT NULL,
	"email" text NOT NULL,
	"passwordHash" text NOT NULL,
	"fullName" text NOT NULL,
	"role" "user_role" DEFAULT 'OWNER' NOT NULL,
	"lastLoginAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchantId" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" NOT NULL,
	"tokenHash" text NOT NULL,
	"invitedByUserId" uuid NOT NULL,
	"expiresAt" timestamp (3) NOT NULL,
	"acceptedAt" timestamp (3),
	"revokedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchantId" uuid NOT NULL,
	"label" text NOT NULL,
	"accountHolderName" text NOT NULL,
	"bankName" text NOT NULL,
	"last4" varchar(4) NOT NULL,
	"routingCode" text NOT NULL,
	"currency" char(3) NOT NULL,
	"status" "bank_account_status" DEFAULT 'PENDING' NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchantId" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"country" char(2),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transactionId" uuid NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchantId" uuid NOT NULL,
	"customerId" uuid,
	"reference" text NOT NULL,
	"type" "transaction_type" DEFAULT 'PAYMENT' NOT NULL,
	"status" "transaction_status" NOT NULL,
	"amountMinor" integer NOT NULL,
	"feeMinor" integer DEFAULT 0 NOT NULL,
	"netMinor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"method" "payment_method" NOT NULL,
	"cardBrand" text,
	"last4" varchar(4),
	"description" text,
	"failureCode" text,
	"failureReason" text,
	"parentTransactionId" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"settledAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchantId" uuid NOT NULL,
	"bankAccountId" uuid NOT NULL,
	"reference" text NOT NULL,
	"amountMinor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"status" "payout_status" DEFAULT 'PENDING' NOT NULL,
	"initiatedByUserId" uuid,
	"idempotencyKey" text,
	"pspReference" text,
	"estimatedArrivalAt" timestamp (3),
	"processingAt" timestamp (3),
	"paidAt" timestamp (3),
	"failedAt" timestamp (3),
	"failureCode" text,
	"failureReason" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eventId" text NOT NULL,
	"type" text NOT NULL,
	"payoutId" uuid,
	"payload" jsonb NOT NULL,
	"receivedAt" timestamp (3) DEFAULT now() NOT NULL,
	"processedAt" timestamp (3),
	"outcome" "webhook_outcome" DEFAULT 'APPLIED' NOT NULL,
	"notes" text,
	CONSTRAINT "webhook_events_eventId_unique" UNIQUE("eventId")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchantId" uuid NOT NULL,
	"kind" "ledger_entry_kind" NOT NULL,
	"amountMinor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"state" "ledger_entry_state" DEFAULT 'AVAILABLE' NOT NULL,
	"availableAt" timestamp (3),
	"transactionId" uuid,
	"payoutId" uuid,
	"description" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_merchantId_merchants_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_merchantId_merchants_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitedByUserId_users_id_fk" FOREIGN KEY ("invitedByUserId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_merchantId_merchants_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_merchantId_merchants_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_events" ADD CONSTRAINT "transaction_events_transactionId_transactions_id_fk" FOREIGN KEY ("transactionId") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchantId_merchants_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customerId_customers_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_parentTransactionId_fkey" FOREIGN KEY ("parentTransactionId") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_merchantId_merchants_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_bankAccountId_bank_accounts_id_fk" FOREIGN KEY ("bankAccountId") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_initiatedByUserId_users_id_fk" FOREIGN KEY ("initiatedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_payoutId_payouts_id_fk" FOREIGN KEY ("payoutId") REFERENCES "public"."payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_merchantId_merchants_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transactionId_transactions_id_fk" FOREIGN KEY ("transactionId") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payoutId_payouts_id_fk" FOREIGN KEY ("payoutId") REFERENCES "public"."payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens" USING btree ("familyId");--> statement-breakpoint
CREATE INDEX "users_merchantId_idx" ON "users" USING btree ("merchantId");--> statement-breakpoint
CREATE INDEX "invitations_merchantId_email_idx" ON "invitations" USING btree ("merchantId","email");--> statement-breakpoint
CREATE INDEX "bank_accounts_merchantId_idx" ON "bank_accounts" USING btree ("merchantId");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_merchantId_email_key" ON "customers" USING btree ("merchantId","email");--> statement-breakpoint
CREATE INDEX "customers_merchantId_idx" ON "customers" USING btree ("merchantId");--> statement-breakpoint
CREATE INDEX "transaction_events_transactionId_createdAt_idx" ON "transaction_events" USING btree ("transactionId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_merchantId_reference_key" ON "transactions" USING btree ("merchantId","reference");--> statement-breakpoint
CREATE INDEX "transactions_merchantId_createdAt_idx" ON "transactions" USING btree ("merchantId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_merchantId_status_idx" ON "transactions" USING btree ("merchantId","status");--> statement-breakpoint
CREATE INDEX "transactions_merchantId_method_idx" ON "transactions" USING btree ("merchantId","method");--> statement-breakpoint
CREATE INDEX "transactions_customerId_idx" ON "transactions" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX "transactions_parentTransactionId_idx" ON "transactions" USING btree ("parentTransactionId");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_merchantId_reference_key" ON "payouts" USING btree ("merchantId","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_merchantId_idempotencyKey_key" ON "payouts" USING btree ("merchantId","idempotencyKey");--> statement-breakpoint
CREATE INDEX "payouts_merchantId_createdAt_idx" ON "payouts" USING btree ("merchantId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payouts_merchantId_status_idx" ON "payouts" USING btree ("merchantId","status");--> statement-breakpoint
CREATE INDEX "webhook_events_payoutId_idx" ON "webhook_events" USING btree ("payoutId");--> statement-breakpoint
CREATE INDEX "webhook_events_receivedAt_idx" ON "webhook_events" USING btree ("receivedAt");--> statement-breakpoint
CREATE INDEX "ledger_entries_merchantId_state_idx" ON "ledger_entries" USING btree ("merchantId","state");--> statement-breakpoint
CREATE INDEX "ledger_entries_transactionId_idx" ON "ledger_entries" USING btree ("transactionId");--> statement-breakpoint
CREATE INDEX "ledger_entries_payoutId_idx" ON "ledger_entries" USING btree ("payoutId");