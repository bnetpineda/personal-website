CREATE TABLE "statement_balances" (
	"provider" text NOT NULL,
	"account" text NOT NULL,
	"currency" varchar(3) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"as_of" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "statement_balances_provider_account_currency_pk" PRIMARY KEY("provider","account","currency"),
	CONSTRAINT "statement_balances_provider" CHECK ("statement_balances"."provider" in ('wise', 'maribank'))
);
