CREATE TABLE "category_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contains" text NOT NULL,
	"provider" text,
	"kind" "cash_flow_kind" NOT NULL,
	"category_id" integer NOT NULL,
	"auto_post" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imported_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"account_key" text NOT NULL,
	"external_id" text NOT NULL,
	"occurred_on" date NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric NOT NULL,
	"currency" varchar(30) NOT NULL,
	"description" text NOT NULL,
	"realized_pnl" numeric,
	"status" text DEFAULT 'pending' NOT NULL,
	"category_id" integer,
	"transfer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imported_entries_provider" CHECK ("imported_entries"."provider" in ('wise', 'binance', 'ibkr')),
	CONSTRAINT "imported_entries_kind" CHECK ("imported_entries"."kind" in ('payment','transfer','reward','dividend','interest','fee','tax','trade','other')),
	CONSTRAINT "imported_entries_status" CHECK ("imported_entries"."status" in ('pending','posted','ignored','transfer','reviewed'))
);
--> statement-breakpoint
CREATE TABLE "notification_dismissals" (
	"key" text PRIMARY KEY NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_connections" ADD COLUMN "credentials_expire_on" date;--> statement-breakpoint
ALTER TABLE "account_connections" ADD COLUMN "history_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_connections" ADD COLUMN "history_error" text;--> statement-breakpoint
ALTER TABLE "account_connections" ADD COLUMN "history_coverage" jsonb;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_entries" ADD CONSTRAINT "imported_entries_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "imported_entries_source_unique" ON "imported_entries" USING btree ("provider","account_key","external_id");--> statement-breakpoint
CREATE INDEX "imported_entries_status_date_idx" ON "imported_entries" USING btree ("status","occurred_on");--> statement-breakpoint
CREATE INDEX "imported_entries_transfer_idx" ON "imported_entries" USING btree ("transfer_id");