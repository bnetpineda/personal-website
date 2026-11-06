CREATE TABLE "admin_state" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"session_epoch" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_state_single_row" CHECK ("admin_state"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "category_budgets" (
	"category_id" integer NOT NULL,
	"month" varchar(7) NOT NULL,
	"amount" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_budgets_category_id_month_pk" PRIMARY KEY("category_id","month"),
	CONSTRAINT "category_budgets_month_format" CHECK ("category_budgets"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "category_budgets_amount_nonnegative" CHECK ("category_budgets"."amount" is null or "category_budgets"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"measure" text NOT NULL,
	"target" numeric(14, 2) NOT NULL,
	"saved" numeric(14, 2),
	"target_on" date,
	"archived" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_measure" CHECK ("goals"."measure" in ('emergency_fund', 'net_worth', 'cash', 'investments', 'manual')),
	CONSTRAINT "goals_target_positive" CHECK ("goals"."target" > 0),
	CONSTRAINT "goals_saved_nonnegative" CHECK ("goals"."saved" is null or "goals"."saved" >= 0)
);
--> statement-breakpoint
ALTER TABLE "category_budgets" ADD CONSTRAINT "category_budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;