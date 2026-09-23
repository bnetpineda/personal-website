CREATE TABLE "account_connections" (
	"provider" text PRIMARY KEY NOT NULL,
	"encrypted_credentials" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"include_in_net_worth" boolean DEFAULT false NOT NULL,
	"snapshot" jsonb,
	"last_attempt_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"error" text,
	"sync_lease" uuid,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_connections_provider" CHECK ("account_connections"."provider" in ('wise', 'binance', 'ibkr'))
);
