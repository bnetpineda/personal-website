ALTER TABLE "imported_entries" DROP CONSTRAINT "imported_entries_provider";--> statement-breakpoint
ALTER TABLE "statement_balances" DROP CONSTRAINT "statement_balances_provider";--> statement-breakpoint
ALTER TABLE "imported_entries" ADD CONSTRAINT "imported_entries_provider" CHECK ("imported_entries"."provider" in ('wise', 'binance', 'ibkr', 'maribank', 'hyperliquid', 'gotyme'));--> statement-breakpoint
ALTER TABLE "statement_balances" ADD CONSTRAINT "statement_balances_provider" CHECK ("statement_balances"."provider" in ('wise', 'maribank', 'gotyme'));