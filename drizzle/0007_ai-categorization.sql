ALTER TABLE "imported_entries" ADD COLUMN "categorized_by" text;--> statement-breakpoint
ALTER TABLE "imported_entries" ADD COLUMN "ai_reason" text;--> statement-breakpoint
ALTER TABLE "imported_entries" ADD COLUMN "ai_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "imported_entries" ADD CONSTRAINT "imported_entries_categorized_by" CHECK ("imported_entries"."categorized_by" is null or "imported_entries"."categorized_by" in ('rule','ai','manual'));--> statement-breakpoint
-- Homes for broker and transfer fees and withholding tax, so they don't all land in "Other". Re-runnable.
INSERT INTO "categories" ("kind", "name", "color", "sort_order") VALUES
  ('expense', 'Fees & charges', '#7A83FF', 124),
  ('expense', 'Taxes', '#FF4D50', 126)
ON CONFLICT ("kind", "name") DO NOTHING;
