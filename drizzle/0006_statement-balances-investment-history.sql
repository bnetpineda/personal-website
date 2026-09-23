CREATE TABLE "investment_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"file_hash" text NOT NULL,
	"accounts" jsonb NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"entries" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_key" text NOT NULL,
	"scope" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"cursor" text NOT NULL,
	"completed_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"error" text,
	"lease" uuid,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "statement_source" text;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "statement_as_of" date;--> statement-breakpoint
ALTER TABLE "imported_entries" ADD COLUMN "trade" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "investment_reports_file_unique" ON "investment_reports" USING btree ("provider","file_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "investment_syncs_account_scope_unique" ON "investment_syncs" USING btree ("account_key","scope");--> statement-breakpoint
CREATE UNIQUE INDEX "holdings_statement_currency_unique" ON "holdings" USING btree ("statement_source","currency");