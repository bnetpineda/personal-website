ALTER TABLE "spot_fifo_meta" ADD COLUMN "source_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "spot_fifo_meta" DROP COLUMN "source_updated_at";