ALTER TABLE "imported_entries" ADD COLUMN "ai_suggestion" text;--> statement-breakpoint
ALTER TABLE "imported_entries" ADD CONSTRAINT "imported_entries_ai_suggestion" CHECK ("imported_entries"."ai_suggestion" is null or "imported_entries"."ai_suggestion" in ('post','transfer','investment','ignore'));--> statement-breakpoint
-- Backfill suggestions Jev left pending before the column existed; they were only recorded in ai_reason.
UPDATE "imported_entries" SET "ai_suggestion" = CASE
  WHEN "category_id" IS NOT NULL THEN 'post'
  WHEN "ai_reason" LIKE 'Jev: Transfer (%' THEN 'transfer'
  WHEN "ai_reason" LIKE 'Jev: Investment (%' THEN 'investment'
  WHEN "ai_reason" LIKE 'Jev: Ignore (%' THEN 'ignore'
END
WHERE "status" = 'pending' AND "categorized_by" = 'ai' AND "ai_reason" LIKE 'Jev: %';
