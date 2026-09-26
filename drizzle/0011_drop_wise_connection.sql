-- Wise personal tokens cannot sync; statements arrive as CSV imports. Drop the saved token and balances.
DELETE FROM "account_connections" WHERE "provider" = 'wise';--> statement-breakpoint
ALTER TABLE "account_connections" DROP CONSTRAINT "account_connections_provider";--> statement-breakpoint
ALTER TABLE "account_connections" ADD CONSTRAINT "account_connections_provider" CHECK ("account_connections"."provider" in ('binance', 'ibkr'));