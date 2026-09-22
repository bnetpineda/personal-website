CREATE TYPE "public"."recurrence_frequency" AS ENUM('weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'semiannual', 'yearly');--> statement-breakpoint
CREATE TABLE "recurring_cash_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "cash_flow_kind" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'PHP' NOT NULL,
	"category_id" integer NOT NULL,
	"description" text NOT NULL,
	"account" text,
	"notes" text,
	"frequency" "recurrence_frequency" NOT NULL,
	"start_on" date NOT NULL,
	"second_day" smallint,
	"end_on" date,
	"next_on" date,
	"auto_post" boolean DEFAULT true NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_amount_positive" CHECK ("recurring_cash_flows"."amount" > 0),
	CONSTRAINT "recurring_currency_format" CHECK ("recurring_cash_flows"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "recurring_second_day_range" CHECK ("recurring_cash_flows"."second_day" is null or "recurring_cash_flows"."second_day" between 1 and 31),
	CONSTRAINT "recurring_end_after_start" CHECK ("recurring_cash_flows"."end_on" is null or "recurring_cash_flows"."end_on" >= "recurring_cash_flows"."start_on")
);
--> statement-breakpoint
ALTER TABLE "cash_flows" ADD COLUMN "recurring_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_flows" ADD COLUMN "recurring_on" date;--> statement-breakpoint
ALTER TABLE "recurring_cash_flows" ADD CONSTRAINT "recurring_cash_flows_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_cash_flows_next_on_idx" ON "recurring_cash_flows" USING btree ("next_on");--> statement-breakpoint
ALTER TABLE "cash_flows" ADD CONSTRAINT "cash_flows_recurring_id_recurring_cash_flows_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."recurring_cash_flows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_flows_recurring_occurrence_unique" ON "cash_flows" USING btree ("recurring_id","recurring_on");