CREATE TYPE "public"."report_frequency" AS ENUM('OFF', 'WEEKLY', 'MONTHLY');--> statement-breakpoint
CREATE TABLE "report_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"frequency" "report_frequency" DEFAULT 'OFF' NOT NULL,
	"lastSentAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "report_subscriptions_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
ALTER TABLE "report_subscriptions" ADD CONSTRAINT "report_subscriptions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_subscriptions_frequency_idx" ON "report_subscriptions" USING btree ("frequency");