CREATE TABLE "portfolio_snapshots" (
	"provider" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"value_usd" numeric(18, 2) NOT NULL,
	"cost_usd" numeric(18, 2),
	"pnl_usd" numeric(18, 2),
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_snapshots_provider_snapshot_date_pk" PRIMARY KEY("provider","snapshot_date"),
	CONSTRAINT "portfolio_snapshots_provider" CHECK ("portfolio_snapshots"."provider" in ('binance', 'ibkr')),
	CONSTRAINT "portfolio_snapshots_source" CHECK ("portfolio_snapshots"."source" in ('balances', 'nav'))
);
