CREATE TYPE "public"."asset_class" AS ENUM('stock', 'etf', 'crypto', 'fund', 'bond', 'cash', 'real_estate', 'other');--> statement-breakpoint
CREATE TYPE "public"."cash_flow_kind" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."liability_kind" AS ENUM('credit_card', 'loan', 'bnpl', 'other');--> statement-breakpoint
CREATE TYPE "public"."price_source" AS ENUM('manual', 'coingecko', 'finnhub');--> statement-breakpoint
CREATE TABLE "cash_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "cash_flow_kind" NOT NULL,
	"occurred_on" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'PHP' NOT NULL,
	"amount_php" numeric(14, 2) NOT NULL,
	"category_id" integer NOT NULL,
	"description" text NOT NULL,
	"account" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_flows_amount_positive" CHECK ("cash_flows"."amount" > 0),
	CONSTRAINT "cash_flows_currency_format" CHECK ("cash_flows"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "cash_flow_kind" NOT NULL,
	"name" text NOT NULL,
	"color" varchar(7) NOT NULL,
	"monthly_budget" numeric(14, 2),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_color_hex" CHECK ("categories"."color" ~ '^#[0-9A-Fa-f]{6}$'),
	CONSTRAINT "categories_budget_nonnegative" CHECK ("categories"."monthly_budget" is null or "categories"."monthly_budget" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"currency" varchar(3) PRIMARY KEY NOT NULL,
	"rate_to_php" numeric NOT NULL,
	"as_of" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_class" "asset_class" NOT NULL,
	"name" text NOT NULL,
	"symbol" text,
	"platform" text,
	"quantity" numeric NOT NULL,
	"avg_cost" numeric NOT NULL,
	"currency" varchar(3) DEFAULT 'PHP' NOT NULL,
	"price_source" "price_source" DEFAULT 'manual' NOT NULL,
	"price_ref" text,
	"last_price" numeric,
	"price_updated_at" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holdings_currency_format" CHECK ("holdings"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "holdings_quantity_nonnegative" CHECK ("holdings"."quantity" >= 0),
	CONSTRAINT "holdings_avg_cost_nonnegative" CHECK ("holdings"."avg_cost" >= 0),
	CONSTRAINT "holdings_last_price_nonnegative" CHECK ("holdings"."last_price" is null or "holdings"."last_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "liabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "liability_kind" NOT NULL,
	"name" text NOT NULL,
	"lender" text,
	"balance" numeric(14, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'PHP' NOT NULL,
	"credit_limit" numeric(14, 2),
	"interest_rate" numeric(7, 3),
	"due_day" smallint,
	"min_payment" numeric(14, 2),
	"archived" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "liabilities_balance_nonnegative" CHECK ("liabilities"."balance" >= 0),
	CONSTRAINT "liabilities_due_day_range" CHECK ("liabilities"."due_day" is null or "liabilities"."due_day" between 1 and 31),
	CONSTRAINT "liabilities_currency_format" CHECK ("liabilities"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ip_hash" text NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "net_worth_snapshots" (
	"snapshot_date" date PRIMARY KEY NOT NULL,
	"assets_php" numeric(18, 2) NOT NULL,
	"liabilities_php" numeric(18, 2) NOT NULL,
	"net_worth_php" numeric(18, 2) NOT NULL,
	"invested_php" numeric(18, 2) NOT NULL,
	"by_class" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_flows" ADD CONSTRAINT "cash_flows_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_flows_kind_occurred_on_idx" ON "cash_flows" USING btree ("kind","occurred_on");--> statement-breakpoint
CREATE INDEX "cash_flows_category_id_idx" ON "cash_flows" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_kind_name_unique" ON "categories" USING btree ("kind","name");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_hash_created_at_idx" ON "login_attempts" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_created_at_idx" ON "login_attempts" USING btree ("created_at");