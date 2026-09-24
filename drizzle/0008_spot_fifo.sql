CREATE TABLE "spot_fifo" (
	"account_key" text NOT NULL,
	"as_of" text NOT NULL,
	"symbol" text NOT NULL,
	"base_asset" text NOT NULL,
	"quote_asset" text NOT NULL,
	"bought" double precision NOT NULL,
	"sold" double precision NOT NULL,
	"remaining" double precision NOT NULL,
	"cost" double precision NOT NULL,
	"realized" double precision NOT NULL,
	"unmatched" integer NOT NULL,
	"external_fees" integer NOT NULL,
	CONSTRAINT "spot_fifo_account_key_as_of_symbol_pk" PRIMARY KEY("account_key","as_of","symbol")
);
--> statement-breakpoint
CREATE TABLE "spot_fifo_meta" (
	"account_key" text NOT NULL,
	"as_of" text NOT NULL,
	"source_count" integer NOT NULL,
	"source_updated_at" timestamp with time zone,
	"ignored_bases" text[] NOT NULL,
	"payment_assets" text[] NOT NULL,
	CONSTRAINT "spot_fifo_meta_account_key_as_of_pk" PRIMARY KEY("account_key","as_of")
);
--> statement-breakpoint
CREATE INDEX "imported_entries_binance_trades_idx" ON "imported_entries" USING btree ("account_key","updated_at") WHERE "imported_entries"."provider" = 'binance' and "imported_entries"."trade" is not null;