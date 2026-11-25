CREATE TABLE "daily_job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	"steps" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "daily_job_runs_started_at_idx" ON "daily_job_runs" USING btree ("started_at");