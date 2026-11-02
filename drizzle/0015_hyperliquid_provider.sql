ALTER TABLE "account_connections" DROP CONSTRAINT "account_connections_provider";--> statement-breakpoint
ALTER TABLE "imported_entries" DROP CONSTRAINT "imported_entries_provider";--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" DROP CONSTRAINT "portfolio_snapshots_provider";--> statement-breakpoint
ALTER TABLE "account_connections" ADD CONSTRAINT "account_connections_provider" CHECK ("account_connections"."provider" in ('binance', 'ibkr', 'hyperliquid'));--> statement-breakpoint
ALTER TABLE "imported_entries" ADD CONSTRAINT "imported_entries_provider" CHECK ("imported_entries"."provider" in ('wise', 'binance', 'ibkr', 'maribank', 'hyperliquid'));--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_provider" CHECK ("portfolio_snapshots"."provider" in ('binance', 'ibkr', 'hyperliquid'));