CREATE TABLE "payout_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchantId" uuid NOT NULL,
	"bankAccountId" uuid,
	"dailyEnabled" boolean DEFAULT false NOT NULL,
	"thresholdEnabled" boolean DEFAULT false NOT NULL,
	"thresholdMinor" integer,
	"lastTriggeredAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "payout_schedules_merchantId_unique" UNIQUE("merchantId")
);
--> statement-breakpoint
ALTER TABLE "payout_schedules" ADD CONSTRAINT "payout_schedules_merchantId_merchants_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_schedules" ADD CONSTRAINT "payout_schedules_bankAccountId_bank_accounts_id_fk" FOREIGN KEY ("bankAccountId") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payout_schedules_dailyEnabled_idx" ON "payout_schedules" USING btree ("dailyEnabled");--> statement-breakpoint
CREATE INDEX "payout_schedules_thresholdEnabled_idx" ON "payout_schedules" USING btree ("thresholdEnabled");